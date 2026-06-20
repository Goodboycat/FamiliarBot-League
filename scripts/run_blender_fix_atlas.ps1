param(
  [string]$BlenderPath = "blender",
  [switch]$Replace
)

$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$script = Join-Path $repo "scripts\blender_fix_atlas_animations.py"

$args = @(
  "--background",
  "--python", $script,
  "--",
  "--repo", $repo
)

if ($Replace) {
  $args += "--replace"
}

& $BlenderPath @args
