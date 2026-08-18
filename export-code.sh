#!/usr/bin/env bash

show_usage() {
  echo "Usage: $0 [-h] [-d </path/to/root>] [-o <output_file>] [-x <excluded_pattern_1,pattern_2...>]"
}

# 1. CRITICAL FIX: Check if no arguments were provided
if [ "$#" -eq 0 ]; then
  show_usage
  exit 1
fi

# Default values
ROOT_DIR="."
OUT_FILE="project-source-code.txt"
USER_EXCLUDES=""

# Parse command line arguments
while getopts "hd:o:x:" opt; do
  case $opt in
    h)
      show_usage
      exit 0
      ;;
    d) ROOT_DIR="$OPTARG" ;;
    o) OUT_FILE="$OPTARG" ;;
    x) USER_EXCLUDES="$OPTARG" ;;
    *) 
      show_usage
      exit 1
      ;;
  esac
done

# Convert output file to an absolute path so it doesn't break when we `cd` into the target directory
if [[ "$OUT_FILE" != /* ]]; then
  OUT_FILE="$(pwd)/$OUT_FILE"
fi

# 1. Pre-defined list of excluded directories and file types (Sorted Alphabetically)
excludes=(
  "*.class"
  "*.dll"
  "*.dylib"
  "*.exe"
  "*.gif"
  "*.ico"
  "*.jpeg"
  "*.jpg"
  "*.mp3"
  "*.mp4"
  "*.pdf"
  "*.png"
  "*.pyc"
  "*.so"
  "*.svg"
  "*.tar.gz"
  "*.wav"
  "*.zip"
  ".git"
  ".idea"
  ".venv"
  ".vscode"
  "__pycache__"
  "build"
  "chroma"
  "dist"
  "env"
  "node_modules"
  "package-lock.json"
  "venv"
  "yarn.lock"
)

# Append user-provided exclusions from the -x option
if [[ -n "$USER_EXCLUDES" ]]; then
  # Split the comma-separated string into an array
  IFS=',' read -ra ADDR <<< "$USER_EXCLUDES"
  for i in "${ADDR[@]}"; do
    # Trim leading and trailing whitespace before adding
    clean_i=$(echo "$i" | xargs)
    excludes+=("$clean_i")
  done
fi

# CRITICAL FIX: Automatically exclude the output file so we don't infinitely read/write to it
excludes+=("$(basename "$OUT_FILE")")

# 2. Dictionary-like function mapping top extensions to markdown language tags
get_language_tag() {
  case "$1" in
    c|h) echo "c" ;;
    cpp|cxx|cc|hpp) echo "cpp" ;;
    cs) echo "csharp" ;;
    css|scss|sass|less) echo "css" ;;
    env) echo "bash" ;; # Better coloring for .env
    go) echo "go" ;;
    html|htm) echo "html" ;;
    java) echo "java" ;;
    js) echo "javascript" ;;
    json) echo "json" ;;
    jsx) echo "jsx" ;;
    kt) echo "kotlin" ;;
    m) echo "objectivec" ;;
    md) echo "markdown" ;;
    php) echo "php" ;;
    py) echo "python" ;;
    r) echo "r" ;;
    rb) echo "ruby" ;;
    rs) echo "rust" ;;
    scala) echo "scala" ;;
    sh|bash|zsh) echo "bash" ;;
    sql) echo "sql" ;;
    swift) echo "swift" ;;
    ts) echo "typescript" ;;
    tsx) echo "tsx" ;;
    xml) echo "xml" ;;
    yml|yaml) echo "yaml" ;;
    *) echo "" ;;
  esac
}

# Navigate to the target directory before executing logic
cd "$ROOT_DIR" || exit 1

# Get the actual folder name of the root directory for our output labels
ROOT_BASENAME=$(basename "$(pwd)")

# Clear or create the output file
> "$OUT_FILE"

# --- DYNAMIC TREE GENERATOR ---
# A recursive pure-bash function to draw the project structure, respecting the excludes array
# Optimized to use standard 'ls' for safe, built-in alphabetical sorting
generate_tree() {
  local dir="$1"
  local prefix="$2"
  
  # Read directory contents into an array, sorted safely
  local items=()
  # Read directory contents (ignoring hidden . and ..), properly sorted
  while IFS= read -r item; do
      [[ -n "$item" ]] && items+=("$item")
  done < <(ls -1A "$dir" 2>/dev/null)
  
  # Filter out excluded items
  local filtered=()
  for basename in "${items[@]}"; do
      local item_path="$dir/$basename"
      local rel_path="${item_path#./}"
      
      local skip=0
      for pattern in "${excludes[@]}"; do
          # Match basename or path against wildcard pattern
          if [[ "$rel_path" == $pattern ]] || [[ "$basename" == $pattern ]] || [[ "$rel_path" == */$pattern/* ]]; then
              skip=1
              break
          fi
      done
      
      [[ $skip -eq 0 ]] && filtered+=("$basename")
  done
  
  # Draw the nodes
  local count=${#filtered[@]}
  local i=0
  for basename in "${filtered[@]}"; do
      ((i++))
      local item_path="$dir/$basename"
      local is_dir=0
      [[ -d "$item_path" ]] && is_dir=1
      
      local pointer="├── "
      local next_prefix="${prefix}│   "
      if [[ $i -eq $count ]]; then
          pointer="└── "
          next_prefix="${prefix}    "
      fi
      
      if [[ $is_dir -eq 1 ]]; then
          echo "${prefix}${pointer}${basename}/" >> "$OUT_FILE"
          generate_tree "$item_path" "$next_prefix"
      else
          echo "${prefix}${pointer}${basename}" >> "$OUT_FILE"
      fi
  done
}

# 3. Write the dynamic project structure block
echo "Project Directory Structure:" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"
echo "\`\`\`" >> "$OUT_FILE"
echo "${ROOT_BASENAME}/" >> "$OUT_FILE"

# Start tree generation from current directory
generate_tree "." ""

echo "\`\`\`" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"

# --- FAST SOURCE CODE DUMPER ---
# Build a highly optimized 'find' command that immediately prunes (ignores) excluded folders 
FIND_PRUNES=()
for pattern in "${excludes[@]}"; do
  FIND_PRUNES+=("-name" "$pattern" "-prune" "-o")
done

# Execute find: skip prunes, find files, output null-separated names to prevent spaces breaking things
find . "${FIND_PRUNES[@]}" -type f -print0 | while IFS= read -r -d '' file; do
  
  # Strip the leading './' from the path
  rel_path="${file#./}"
  
  # Extract extension
  filename=$(basename "$rel_path")
  if [[ "$filename" == *.* ]]; then
    ext="${filename##*.}"
  elif [[ "${filename,,}" == "dockerfile" ]]; then
    ext="dockerfile"
  else
    ext=""
  fi
  
  # Retrieve language tag
  lang=$(get_language_tag "${ext,,}")
  
  # Format Output
  echo "${ROOT_BASENAME}/${rel_path}:" >> "$OUT_FILE"
  echo "" >> "$OUT_FILE"
  echo "\`\`\`$lang" >> "$OUT_FILE"
  
  # Write Code Block
  cat "$rel_path" >> "$OUT_FILE"
  
  # Add newline if file doesn't end with one natively
  tail -c1 "$rel_path" | read -r _ || echo "" >> "$OUT_FILE"
  
  echo "\`\`\`" >> "$OUT_FILE"
    
  # Two line breaks separating blocks
  echo "" >> "$OUT_FILE"
  echo "" >> "$OUT_FILE"

done

echo "Done! Source code and dynamic tree successfully exported to: $OUT_FILE"