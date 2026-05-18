// Command gen-skills-manifest packages the skills/ tree into a deterministic,
// checksum-pinnable release asset for downstream consumers.
//
// It walks --source, computes a SHA-256 over every regular file, writes a
// MANIFEST.json (in stable sorted order) at the root of the staged tree,
// and then emits a gzipped tar archive at --out.
//
// Determinism: file order is sorted by path, header mtime/uid/gid are zeroed,
// numeric owner is used, and the gzip header is written without a name or
// timestamp. Two runs over the same input bytes produce byte-identical
// archives.
//
// The tarball's top-level directory matches the basename of --source (e.g.
// "skills"), so consumers untar in place to reproduce the repo layout at
// that tag.
package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Manifest is the public contract for the skills bundle's MANIFEST.json.
// Field order is fixed by struct tag order so the JSON is stable across runs.
type Manifest struct {
	Version    string         `json:"version"`
	Root       string         `json:"root"`
	FileCount  int            `json:"file_count"`
	TotalBytes int64          `json:"total_bytes"`
	Files      []ManifestFile `json:"files"`
}

// ManifestFile describes one file in the bundle. Path is forward-slash and
// relative to Root (e.g. "design/SKILL.md").
type ManifestFile struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

func main() {
	var (
		sourceDir   string
		outPath     string
		version     string
		manifestArg string
	)
	flag.StringVar(&sourceDir, "source", "skills", "Path to the skills/ tree to package.")
	flag.StringVar(&outPath, "out", "", "Output .tar.gz path. Required.")
	flag.StringVar(&version, "version", "", "Version string written into MANIFEST.json (e.g. v0.3.0). Required.")
	flag.StringVar(&manifestArg, "manifest-name", "MANIFEST.json", "Name of the manifest file inside the bundle root.")
	flag.Parse()

	if outPath == "" || version == "" {
		fmt.Fprintln(os.Stderr, "usage: gen-skills-manifest --out <archive.tar.gz> --version <vX.Y.Z> [--source skills]")
		os.Exit(2)
	}

	if err := run(sourceDir, outPath, version, manifestArg); err != nil {
		fmt.Fprintf(os.Stderr, "gen-skills-manifest: %v\n", err)
		os.Exit(1)
	}
}

func run(sourceDir, outPath, version, manifestName string) error {
	absSource, err := filepath.Abs(sourceDir)
	if err != nil {
		return fmt.Errorf("resolve --source: %w", err)
	}
	info, err := os.Stat(absSource)
	if err != nil {
		return fmt.Errorf("stat --source: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("--source must be a directory: %s", sourceDir)
	}

	root := filepath.Base(absSource)

	files, err := collectFiles(absSource)
	if err != nil {
		return fmt.Errorf("walk %s: %w", sourceDir, err)
	}

	manifest := Manifest{
		Version:   version,
		Root:      root,
		FileCount: len(files),
		Files:     files,
	}
	for _, f := range files {
		manifest.TotalBytes += f.Size
	}

	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}
	manifestBytes = append(manifestBytes, '\n')

	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return fmt.Errorf("mkdir for --out: %w", err)
	}

	return writeArchive(absSource, root, outPath, manifestName, manifestBytes, files)
}

// collectFiles walks the source tree and returns a sorted list of regular
// files (relative paths, forward slashes) with sizes and SHA-256s.
func collectFiles(sourceDir string) ([]ManifestFile, error) {
	var files []ManifestFile
	err := filepath.WalkDir(sourceDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !d.Type().IsRegular() {
			return fmt.Errorf("non-regular file in skills tree: %s", path)
		}
		rel, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)

		sum, size, err := hashFile(path)
		if err != nil {
			return err
		}
		files = append(files, ManifestFile{
			Path:   rel,
			Size:   size,
			SHA256: sum,
		})
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, nil
}

func hashFile(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()

	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// writeArchive produces a deterministic .tar.gz at outPath.
//
// Layout inside the archive:
//
//	<root>/
//	  <manifest-name>     (manifestBytes)
//	  <every file from files, in sorted order>
//
// Determinism guarantees:
//   - Files are emitted in lexicographic order.
//   - tar headers use mtime=0, uid=0, gid=0, numeric owner, mode 0644 (files)
//     or 0755 (the root directory entry).
//   - gzip header omits the original name and timestamp.
func writeArchive(sourceDir, root, outPath, manifestName string, manifestBytes []byte, files []ManifestFile) (err error) {
	out, err := os.Create(outPath)
	if err != nil {
		return fmt.Errorf("create %s: %w", outPath, err)
	}
	defer func() {
		if cerr := out.Close(); err == nil && cerr != nil {
			err = cerr
		}
	}()

	gz, err := gzip.NewWriterLevel(out, gzip.BestCompression)
	if err != nil {
		return fmt.Errorf("gzip writer: %w", err)
	}
	gz.Header.Name = ""
	gz.Header.ModTime = zeroTime()
	gz.Header.OS = 255 // unknown / unspecified

	defer func() {
		if cerr := gz.Close(); err == nil && cerr != nil {
			err = cerr
		}
	}()

	tw := tar.NewWriter(gz)
	defer func() {
		if cerr := tw.Close(); err == nil && cerr != nil {
			err = cerr
		}
	}()

	if err := writeDir(tw, root+"/"); err != nil {
		return err
	}

	type entry struct {
		archivePath string
		sourcePath  string // empty for the manifest, which is in memory
		size        int64
		body        []byte // populated for the manifest only
	}

	all := make([]entry, 0, len(files)+1)
	all = append(all, entry{
		archivePath: root + "/" + manifestName,
		size:        int64(len(manifestBytes)),
		body:        manifestBytes,
	})

	manifestDirs := splitDirs(manifestName)
	for _, d := range manifestDirs {
		all = append(all, entry{archivePath: root + "/" + d + "/"})
	}

	for _, f := range files {
		for _, d := range splitDirs(f.Path) {
			all = append(all, entry{archivePath: root + "/" + d + "/"})
		}
		all = append(all, entry{
			archivePath: root + "/" + f.Path,
			sourcePath:  filepath.Join(sourceDir, filepath.FromSlash(f.Path)),
			size:        f.Size,
		})
	}

	seenDirs := map[string]bool{root + "/": true}
	dedup := all[:0]
	for _, e := range all {
		if strings.HasSuffix(e.archivePath, "/") {
			if seenDirs[e.archivePath] {
				continue
			}
			seenDirs[e.archivePath] = true
		}
		dedup = append(dedup, e)
	}
	all = dedup

	sort.SliceStable(all, func(i, j int) bool { return all[i].archivePath < all[j].archivePath })

	for _, e := range all {
		if strings.HasSuffix(e.archivePath, "/") {
			if err := writeDir(tw, e.archivePath); err != nil {
				return err
			}
			continue
		}
		if e.body != nil {
			if err := writeFileBytes(tw, e.archivePath, e.body); err != nil {
				return err
			}
			continue
		}
		if err := writeFileFromDisk(tw, e.archivePath, e.sourcePath, e.size); err != nil {
			return err
		}
	}

	return nil
}

func writeDir(tw *tar.Writer, archivePath string) error {
	hdr := &tar.Header{
		Name:     archivePath,
		Mode:     0o755,
		Typeflag: tar.TypeDir,
		ModTime:  zeroTime(),
		Format:   tar.FormatPAX,
	}
	return tw.WriteHeader(hdr)
}

func writeFileBytes(tw *tar.Writer, archivePath string, body []byte) error {
	hdr := &tar.Header{
		Name:     archivePath,
		Mode:     0o644,
		Size:     int64(len(body)),
		Typeflag: tar.TypeReg,
		ModTime:  zeroTime(),
		Format:   tar.FormatPAX,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return fmt.Errorf("tar header %s: %w", archivePath, err)
	}
	if _, err := tw.Write(body); err != nil {
		return fmt.Errorf("tar body %s: %w", archivePath, err)
	}
	return nil
}

func writeFileFromDisk(tw *tar.Writer, archivePath, sourcePath string, size int64) error {
	f, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("open %s: %w", sourcePath, err)
	}
	defer f.Close()

	hdr := &tar.Header{
		Name:     archivePath,
		Mode:     0o644,
		Size:     size,
		Typeflag: tar.TypeReg,
		ModTime:  zeroTime(),
		Format:   tar.FormatPAX,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return fmt.Errorf("tar header %s: %w", archivePath, err)
	}
	if _, err := io.Copy(tw, f); err != nil {
		return fmt.Errorf("tar body %s: %w", archivePath, err)
	}
	return nil
}

// splitDirs returns the chain of parent directories for a forward-slash path,
// from the outermost to the innermost (excluding the file itself). For
// "design/reference/notation.md" it returns ["design", "design/reference"].
func splitDirs(p string) []string {
	parts := strings.Split(p, "/")
	if len(parts) <= 1 {
		return nil
	}
	dirs := make([]string, 0, len(parts)-1)
	for i := 1; i < len(parts); i++ {
		dirs = append(dirs, strings.Join(parts[:i], "/"))
	}
	return dirs
}

// zeroTime returns the canonical modtime stamped into every archive header.
// We avoid time.Time{} (year 1) because gzip's 32-bit MTIME field and many
// tar readers reject pre-epoch timestamps; the Unix epoch is the safest
// portable choice and keeps two runs over the same bytes byte-identical.
func zeroTime() time.Time { return time.Unix(0, 0).UTC() }
