pragma circom 2.1.6;

include "bigint_modules/bigint.circom";
include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/mux1.circom";

// multiplies an array of r numbers modulo m
template MultiplyArrayModM(n, k, r) {
    signal input a[r][k];
    signal input m[k];
    signal accum[r][k];
    signal output out[k];

    accum[0] <== a[0];
    for (var i = 1; i < r; i++) {
        accum[i] <== BigMultModP(n, k)(a <== accum[i-1], b <== a[i], p <== m);
    }

    out <== accum[r-1];
}

// computes a ** d modulo m
template ExponentiateModM(n, k, d) {
    // compute d in binary
    var l = 0;
    var temp = d;
    while (temp > 0) {
        l += 1;
        temp = (temp - temp % 2) / 2;
    }
    var dBinary[l];
    for (var i = 0; i < l; i++) {
        dBinary[i] = (d & (1 << i)) >> i;
    }

    var totalOnes = 0;
    for (var i = 0; i < l; i++) {
        totalOnes += dBinary[i];
    }
    
    signal input a[k];
    signal input m[k];
    signal powersOfA[l][k];
    signal relaventPowersOfA[totalOnes][k];
    signal output out[k];

    // check that a < m
    component aLessThanM = BigLessThan(n, k);
    aLessThanM.a <== a;
    aLessThanM.b <== m;
    aLessThanM.out === 1;
    
    // compute a ** (2 ** i) for all i < l
    powersOfA[0] <== a;
    for (var i = 1; i < l; i++) {
        powersOfA[i] <== BigMultModP(n, k)(a <== powersOfA[i-1], b <== powersOfA[i-1], p <== m);
    }

    // put all a ** (2 ** i) corresponding to nonzero bits in d into a single array
    var j = 0;
    for (var i = 0; i < l; i++) {
        if (dBinary[i] == 1) {
            relaventPowersOfA[j] <== powersOfA[i];
            j += 1;
        }
    }

    component multArray = MultiplyArrayModM(n, k, totalOnes);
    multArray.a <== relaventPowersOfA;
    multArray.m <== m;
    out <== multArray.out;
}



template PoseidonArray(size) {
    signal input in[size];
    signal output out;

    // Here size may be larger than 14, the max size of Poseidon function.
    // So we need to use a loop to hash the array
    signal hval[size];
    hval[0] <== Poseidon(2)([0, in[0]]);
    for (var i = 1; i < size; i++) {
        hval[i] <== Poseidon(2)([hval[i-1], in[i]]);
    }
    out <== hval[size-1];
}

template VerifyMerkleProof(size) {
    signal input proof[size];
    signal input directions[size];
    signal input root;
    signal input val;
    signal hval[size+1];
    signal out;
    hval[0] <== val;

    signal hval_selector[size][2];
    for (var i = 0; i < size; i++) {
        hval_selector[i][0] <== Poseidon(2)([hval[i], proof[i]]);
        hval_selector[i][1] <== Poseidon(2)([proof[i], hval[i]]);
        hval[i+1] <== Mux1()(hval_selector[i], directions[i]);
    }

    out <== hval[size];
    out === root;
}


// proves that user knows an RSA signature for a message, given l public keys (i.e. values of n)
template GroupSignature(n, k, nKeys) {
    var d = 65537;
    signal input message[5];
    signal input doubleBlindMessage[k];
    signal input publicKeys[nKeys][k];
    signal input signature[k];
    signal input correctKey[k];
    signal val;
    signal keyValid;
    signal power[k];
    signal keyWorks;
    signal accum[nKeys];
    signal ise[nKeys];
    for (var i = 0; i < nKeys; i++) {
        ise[i] <== BigIsEqual(k)([publicKeys[i], correctKey]);
        if (i > 0){
            accum[i] <== accum[i - 1] * (1 - ise[i]);
        } else{
            accum[i] <== (1 - ise[i]);
        }
    }
    accum[nKeys - 1] === 0;
    // checks that correctKey is compatible with the signature and message
    power <== ExponentiateModM(n, k, d)(a <== signature, m <== correctKey);
    keyWorks <== BigIsEqual(k)([power, doubleBlindMessage]);
    keyWorks === 1;    
}


component main {public [message, publicKeys]} = GroupSignature(120, 35, 300);