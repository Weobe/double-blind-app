#!/bin/bash
set -e 
echo "Installing dependencies..."
npm install
echo "Downloading circuit files..."
curl -L https://github.com/Weobe/double-blind-app/releases/download/circuit-files/circuit.wasm -o circuit.wasm
curl -L https://github.com/Weobe/double-blind-app/releases/download/circuit-files/circuit_final.zkey -o circuit_final.zkey
mkdir -p circuit_files
mv circuit.wasm circuit_files/
mv circuit_final.zkey circuit_files/
# Final message
echo "All steps completed. You can now start sending kudos!" 
