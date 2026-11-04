package modinit

import "testing"

func TestOriginURL(t *testing.T) {
	config := "[remote \"upstream\"]\n\turl = https://a.com/x\n[remote \"origin\"]\n\tfetch = x\n\turl = git@b.com:y/z.git\n"
	if got, ok := originURL(config); !ok || got != "git@b.com:y/z.git" {
		t.Errorf("originURL = %q, %v", got, ok)
	}
	if _, ok := originURL("[remote \"upstream\"]\n\turl = https://a.com/x\n"); ok {
		t.Error("no origin must give none")
	}
}

func TestOriginURLIgnoresComments(t *testing.T) {
	config := "[remote \"origin\"] # main remote\n\turl = git@b.com:y/z.git ; ssh\n"
	if got, ok := originURL(config); !ok || got != "git@b.com:y/z.git" {
		t.Errorf("originURL = %q, %v", got, ok)
	}
}
