#!/bin/bash
# Installs sdk-perl into the current perl from checkouts under $1 (sdk-perl at
# 55816a1, sdk-rust at v0.4.0, protobuf-perl at 008677c), once corpus/cpanfile's
# deps are installed. Its documented installs (cpanm git+…, Dist::Zilla) fail, so
# each dist gets the Makefile.PL its dist.ini would generate.
set -euo pipefail
root=$(cd "$1" && pwd)
export ALIEN_TEMPORALIO_CORE_SDK_RUST_PATH=$root/sdk-rust
export ALIEN_TEMPORALIO_PERL_BRIDGE_EXT_PATH=$root/sdk-perl/ext/temporalio-perl-bridge

alien() { # dir module distname
  local b=$root/build-$1
  rm -rf "$b" && mkdir -p "$b" && cp -R "$root/sdk-perl/$1/." "$b/"
  cat > "$b/Makefile.PL" <<EOF
use ExtUtils::MakeMaker; use Alien::Build::MM;
my \$abmm = Alien::Build::MM->new;
WriteMakefile(\$abmm->mm_args(NAME => '$2', VERSION => '0.2.0', DISTNAME => '$3'));
sub MY::postamble { \$abmm->mm_postamble(@_) }
EOF
  (cd "$b" && perl Makefile.PL && make && make install)
}
alien alien-core Alien::Temporalio::Core Alien-Temporalio-Core
alien alien-perl-bridge Alien::Temporalio::PerlBridge Alien-Temporalio-PerlBridge

dist() { # dir distname version
  cat > "$1/Makefile.PL" <<EOF
use ExtUtils::MakeMaker; use File::ShareDir::Install;
install_share dist => 'share';
WriteMakefile(NAME => '$2', DISTNAME => '$2', VERSION => '$3');
package MY; use File::ShareDir::Install qw(postamble);
EOF
  (cd "$1" && perl Makefile.PL && make && make install)
}
dist "$root/protobuf-perl" Protobuf 0.1.0
dist "$root/sdk-perl/sdk" Temporalio-SDK 0.2.0
