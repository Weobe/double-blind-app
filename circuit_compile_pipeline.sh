#!/bin/bash
set -e  # Exit on any error

# Step 1: Compile the circom circuit
echo "Step 1: Compiling the circom circuit..."
circom --r1cs --wasm --c --sym --inspect circuit.circom 
if [ $? -ne 0 ]; then 
   echo "Error: circom failed."
   exit 1
fi
echo "Step 1 completed."

# Step 2: Setup Groth16 proving system
echo "Step 2: Running snarkjs groth16 setup..."
if [ $# -lt 1 ]; then
    echo "Error: Please provide the .ptau filename as a CLI argument."
    exit 1
fi
ptauFile="$1"
snarkjs groth16 setup circuit.r1cs "$ptauFile" circuit_0003.zkey
if [ $? -ne 0 ]; then 
    echo "Error: snarkjs groth16 setup failed."
    exit 1
fi
echo "Step 2 completed."

# Step 3: Apply a beacon for randomness
echo "Step 3: Applying beacon to randomize zkey"
snarkjs zkey beacon circuit_0003.zkey circuit_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon phase2"
if [ $? -ne 0 ]; then 
    echo "Error: snarkjs zkey beacon failed."
    exit 1
fi
echo "Step 3 completed."

# Step 4: Export the verification key
echo "Step 4: Exporting verification key..."
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
if [ $? -ne 0 ]; then 
    echo "Error: snarkjs zkey export verificationkey failed."
    exit 1
fi
echo "Step 4 completed."
echo "Relocating Files"
mkdir -p circuit_files
mv circuit_js/circuit.wasm circuit_files/circuit.wasm
mv verification_key.json circuit_files/verification_key.json
mv circuit_final.zkey circuit_files/circuit_final.zkey
mv circuit.r1cs circuit_files/circuit.r1cs
mv circuit.sym circuit_files/circuit.sym
rm circuit_0003.zkey


# Final message
echo "All steps completed. You can now start sending kudos!" 