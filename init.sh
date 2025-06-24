#!/bin/bash
set -e 

CIRCUIT_DIR="./circuit_files"
CIRCUIT_URL_BASE="https://github.com/Weobe/double-blind-app/releases/download/circuit-files"
CLONE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

download() {
  local url="$1"
  local output="$2"

  if command -v curl &> /dev/null; then
    curl -L "$url" -o "$output"
  elif command -v wget &> /dev/null; then
    wget "$url" -O "$output"
  else
    echo "❌ Neither curl nor wget is installed. Please install one of them to continue."
    exit 1
  fi
}

ensure_path_in_shell_rc() {
  if [[ "$SHELL" == */zsh ]]; then
    SHELL_RC="$HOME/.zshrc"
  elif [[ "$SHELL" == */bash ]]; then
    SHELL_RC="$HOME/.bashrc"
  else
    SHELL_RC="$HOME/.profile"
  fi

  if ! grep -q 'export PATH="$HOME/bin:$PATH"' "$SHELL_RC"; then
    echo 'export PATH="$HOME/bin:$PATH"' >> "$SHELL_RC"
    echo "Added ~/bin to PATH in $SHELL_RC"
  else
    echo "~/bin already in PATH in $SHELL_RC"
  fi
}

install_commands() {
  mkdir -p "$HOME/bin"

  # Array of source → target pairs
  declare -a sources=("${@}")

  # Loop over each pair
  for ((i = 0; i < ${#sources[@]}; i+=2)); do
    local src="${sources[$i]}"
    local tgt="$HOME/bin/${sources[$i+1]}"

    if [ ! -f "$src" ]; then
      echo "❌ Source file '$src' does not exist."
      exit 1
    fi

    ln -sf "$CLONE_DIR/$src" "$tgt"

    chmod +x "$CLONE_DIR/$src"
    echo "✅ Installed '$tgt'"
  done
}

download_circuit_files() {
  mkdir -p "$CIRCUIT_DIR"
  echo "⬇️ Downloading circuit files... (this may take a while)"
  download "$CIRCUIT_URL_BASE/circuit.wasm" "$CIRCUIT_DIR/circuit.wasm"
  download "$CIRCUIT_URL_BASE/circuit_final.zkey" "$CIRCUIT_DIR/circuit_final.zkey"
  echo "✅ Circuit files downloaded to $CIRCUIT_DIR"
}

echo "Welcome to the Double Blind App setup script!"
echo "This script will help you set up the Double Blind App on your system."
echo "Installing dependencies..."
npm install
echo "Downloading circuit files..."
download_circuit_files
echo "Setting up environment..."

install_commands \
                "send-kudos.sh" "send-kudos" \
                "edit-kudos-group.sh" "edit-kudos-group"

ensure_path_in_shell_rc
# Final message
echo "All steps completed. You can now start sending kudos!" 
