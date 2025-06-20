//import { groth16 } from "snarkjs";
const groth16 = require('snarkjs').groth16;
const { messageToBigInt, splitBigIntToChunks, sha512, str2bytes, sshString, concat, hex2bytes, bytes2hex, parseSSHSignature} = require('./rsa_key_parser');
const { processKeys } = require('./key_processor');
const { Command } = require('commander');
const program = new Command();
const prompt = require('prompt-sync')();
const fs = require('node:fs');  

// Helper function to convert BigInt to hex string
function bigIntToHex(bigInt) {
    return '0x' + bigInt.toString(16);
}

// Helper function to format hex string with line breaks
function formatHexString(hex) {
    return hex.match(/.{1,64}/g).join('\n');
}

// Function to process message
async function processMessage(message) {
    if (!message) {
        return;
    }
    try {
        // Convert message to BigInt and log to console
        const messageAsBigInt = await messageToBigInt(message);
        return splitBigIntToChunks(messageAsBigInt);
    } catch (error) {
        console.error('Error processing message:', error);
        throw new Error('Failed to process message');
    }
}


// Function to process and display signature
function processSignature(signature) {
    if (!signature) {
        return;
    }
    let parsedSignatureChunks;
    try {
        const parsed = parseSSHSignature(signature);
        
        parsedSignatureChunks = {
            signature: splitBigIntToChunks(parsed.signature),
            publicKey: splitBigIntToChunks(parsed.publicKey),
        };
    } catch (error) {
        console.error('Error parsing signature:', error);
        parsedSignatureChunks = [];
    }   
    return parsedSignatureChunks;
}

    

main();

async function main() {     
    program
    .name('send-kudos')
    .description('Send anonymous kudos to 0xPARC group members')
    .version('0.0.0');
    program
    .description('Send kudos')
    .option('--sig <Path To Signature>', 'Specify path to your double-blind signature', "github_rsa.sig")
    .option('--gpk <Path To Group Public Keys>', 'Specify path to the group public keys', "github_user_list_public_keys.json")
    .parse(process.argv);
    const args = program.parse().opts();
    let message = prompt("Message:");
    // what happends if the user does not provide sig and gpk?
    if (!message) {
        console.error("No message provided. Exiting.");
        process.exit(1);
    }
    let signaturePath = args.sig.trim();
    let groupPublicKeysPath = args.gpk.trim();
    let signature;
    try{
        const signature_file = await fs.readFileSync(signaturePath, 'utf8');
        signature = signature_file;
    } catch (error) {
        console.error('Error reading signature file:', error);
        process.exit(1);
    }
    let groupPublicKeys;
    try{
        const groupPublicKeys_file = await fs.readFileSync(groupPublicKeysPath, 'utf8');
        groupPublicKeys = JSON.parse(groupPublicKeys_file);
    } catch (error) {
        console.error('Error reading group public keys file:', error);
        process.exit(1);
    }
    const listOfUsernames = Object.keys(groupPublicKeys.group_members);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // Remember to add 1 for typical month representation
    const day = now.getDate();
    const date = `${year}-${month + 1}-${day}`;

    const doubleBlindMessage = "0xPARC" // This could change?
    
    const hashedMessageInt = BigInt("0x" + bytes2hex(await sha512(str2bytes(message))));
    const parsedHashedMessage = splitBigIntToChunks(hashedMessageInt, 120, 5);
    const parsedHashedDoubleBlindMessage = await processMessage(doubleBlindMessage);
    const processedSignature = await processSignature(signature);
    const parsedSignature = processedSignature.signature;
    const parsedPublicKey = processedSignature.publicKey;
    const publicKeys = processKeys(groupPublicKeys);

    let proofStr;
    console.log("Generating proof...");
    try {
        const { proof, publicSignals} = await groth16.fullProve({
            message: parsedHashedMessage,
            doubleBlindMessage: parsedHashedDoubleBlindMessage,
            publicKeys: publicKeys,
            signature: parsedSignature,
            correctKey: parsedPublicKey,
        }, "circuit_files/circuit.wasm", "circuit_files/circuit_final.zkey");
        proofStr = JSON.stringify(proof, null, 2);
    } catch (error) {
        console.error("Error generating proof:", error);
        throw new Error("Failed to generate proof");
    }

    
    const data = {
        to: "duruozer13@gmail.com", // Specify the recipient, if any
        header: "Kudos!", // Specify the header or title of the message
        message: message, // The main content of the message
        senders: listOfUsernames, // List of senders or contributors
        group_signature: proofStr, // The group signature generated from the proof
        date: date // The current date in YYYY-MM-DD format
    };

    fetch('http://localhost:8000', {
        method: 'POST', // Specify the HTTP method as POST
        headers: {
            'Content-Type': 'application/json' // Indicate the type of data being sent
        },
        body: JSON.stringify(data) // Convert the JavaScript object to a JSON string for the request body
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text(); // Use text() instead of json() since server might return plain text
     })
    .then(responseData => {
        console.log('Success:', responseData);
        process.exit(0); // Exit successfully after completion
    })
    .catch(error => {
        console.error('Error:', error);
        process.exit(1); // Exit with error code
    });
    return;
}


