const groth16 = require('snarkjs').groth16;
const crypto = require('crypto');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const { Command } = require('commander');
const program = new Command();
const prompt = require('prompt-sync')();
const fs = require('node:fs');  
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

// -------- GITHUB PUBLIC KEY SCRAPER --------

async function getUserPublicKeys(username) {
    try {
        const response = await octokit.users.listPublicKeysForUser({
            username
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching public keys for ${username}:`, error.message);
        return [];
    }
}

// Function to determine key type
function getKeyType(keyString) {
    if (keyString.startsWith('ssh-rsa')) return 'RSA';
    if (keyString.startsWith('ssh-ed25519')) return 'ED25519';
    if (keyString.startsWith('ecdsa-sha2-nistp256')) return 'ECDSA';
    if (keyString.startsWith('ssh-dss')) return 'DSA';
    return 'UNKNOWN';
}

// Function to filter out non-RSA keys
function filterRSAKeys(publicKeys) {
    return publicKeys.filter(key => {
        const keyType = getKeyType(key.key);
        return keyType === 'RSA';
    });
}

function filterED25519Keys(publicKeys) {
    return publicKeys.filter(key => {
        const keyType = getKeyType(key.key);
        return keyType === 'ED25519';
    });
}

async function scrapePublicKeys(groupListArray) {
    groupListArray.sort();
    // Get public keys for each user in the list
    const results = {
        group_members: {}
    };  
    for (const username of groupListArray) {
        try{
            const publicKeys = await getUserPublicKeys(username);
            if (publicKeys.length > 0) {
                // Filter for RSA keys only
                const rsaKeys = filterRSAKeys(publicKeys);
                if (rsaKeys.length > 0) {
                    results.group_members[username] = {
                        publicKeys: [
                            ...rsaKeys.map(key => ({
                                id: key.id,
                                key: key.key,
                                title: key.title,
                                type: getKeyType(key.key)
                            }))
                        ]
                    };
                }
            }
        } catch (error) {
            console.error(`Error fetching public keys for ${username}:`, error.message);
        }
    }
    
    return results;
}


// -------- RSA KEY PARSING FUNCTIONS --------
function parseRSAPublicKey(keyString) {
    const parts = keyString.trim().split(/\s+/);
    if (parts.length < 2 || parts[0] !== "ssh-rsa") {
        throw new Error("Invalid key format: Keys must begin with 'ssh-rsa'");
    }
    const keyData = atob(parts[1]);
    // Helper to read big-endian 4-byte int
    function readUint32(bytes, offset) {
        return (
            (bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            (bytes[offset + 3])
        ) >>> 0;
    }
    // Convert string to byte array
    const bytes = [];
    for (let i = 0; i < keyData.length; i++) {
        bytes.push(keyData.charCodeAt(i));
    }
    let offset = 0;
    // Read "ssh-rsa"
    const typeLen = readUint32(bytes, offset);
    offset += 4;
    const type = String.fromCharCode(...bytes.slice(offset, offset + typeLen));
    offset += typeLen;
    if (type !== "ssh-rsa") {
        throw new Error("Not an ssh-rsa key: Key format not recognized");
    }
    // Read exponent
    const eLen = readUint32(bytes, offset);
    offset += 4 + eLen;
    // Read modulus
    const nLen = readUint32(bytes, offset);
    offset += 4;
    const nBytes = bytes.slice(offset, offset + nLen);
    // Convert modulus bytes to hex string
    let hex = "";
    for (let b of nBytes) {
        hex += b.toString(16).padStart(2, "0");
    }
    // Convert hex to BigInt
    const modulus = BigInt("0x" + hex);
    return modulus;
}

function splitBigIntToChunks(bigint, chunkBits = 120, numChunks = 35) {
    const chunks = [];
    const mask = (1n << BigInt(chunkBits)) - 1n;
    for (let i = 0n; i < BigInt(numChunks); i++) {
        chunks.push(String((bigint & (mask << (i * BigInt(chunkBits)))) >> (i * BigInt(chunkBits))));
    }
    return chunks;
}

// helper: SHA-512 via Web Crypto
async function sha512(data) {
  // data: ArrayBuffer or TypedArray
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  return new Uint8Array(hashBuffer);
}

// helper: encode a JS string to UTF-8 bytes
function str2bytes(str) {
  return new TextEncoder().encode(str);
}

// helper: pack an SSH string (4-byte BE length + data)
function sshString(bytes) {
  const len = bytes.length;
  const out = new Uint8Array(4 + len);
  // write length big-endian
  out[0] = (len >>> 24) & 0xff;
  out[1] = (len >>> 16) & 0xff;
  out[2] = (len >>> 8 ) & 0xff;
  out[3] = (len       ) & 0xff;
  out.set(bytes, 4);
  return out;
}

// helper: concat many Uint8Arrays
function concat(...arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

// helper: hex string → Uint8Array
function hex2bytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(2*i, 2), 16);
  }
  return bytes;
}

// helper: Uint8Array → hex string
function bytes2hex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// converts text message to BigInt m
async function messageToBigInt(msgStr) {
  const msgBytes    = str2bytes(msgStr);
  const MAGIC       = str2bytes('SSHSIG');
  const NAMESPACE   = str2bytes('file');
  const HASHALG     = str2bytes('sha512');
  const k           = 512;  // modulus length in bytes
  
  // 1) inner hash: H1 = SHA512(msg)
  const H1 = await sha512(msgBytes);

  // 2) wrapper = MAGIC || sshString(NAMESPACE) || sshString(empty) || sshString(HASHALG) || sshString(H1)
  const wrapper = concat(
    MAGIC,
    sshString(NAMESPACE),
    sshString(new Uint8Array(0)),
    sshString(HASHALG),
    sshString(H1)
  );

  // 3) digestInfo prefix for SHA-512 (ASN.1 DER header)
  const digestinfoPrefix = hex2bytes('3051300d060960864801650304020305000440');

  // 4) outer hash: H2 = SHA512(wrapper)
  const H2 = await sha512(wrapper);

  // 5) digestinfo = prefix || H2
  const digestinfo = concat(digestinfoPrefix, H2);

  // 6) build EM = 0x00‖0x01‖PS‖0x00‖digestinfo
  const psLen = k - 3 - digestinfo.length;
  const PS    = new Uint8Array(psLen).fill(0xff);
  const EM    = concat(
    new Uint8Array([0x00, 0x01]),
    PS,
    new Uint8Array([0x00]),
    digestinfo
  );

  let output = BigInt("0x" + bytes2hex(EM));
  return output;
}

function parseSSHSignature(raw) {
    // Decode Base64 to a Uint8Array
    const b64 = raw
    .replace(/-----(BEGIN|END) SSH SIGNATURE-----/g, '')
    .replace(/\s+/g, '');
    const binStr = atob(b64);
    const buf = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      buf[i] = binStr.charCodeAt(i);
    }
    const dv = new DataView(buf.buffer);
  
    let offset = 0;
    // 1) Check the ASCII magic "SSHSIG"
    const magic = String.fromCharCode(...buf.slice(0, 6));
    if (magic !== "SSHSIG") {
      throw new Error("Invalid SSHSIG magic; expected 'SSHSIG'");
    }
    offset += 6;
  
    // 2) Read version (uint32)
    const version = dv.getUint32(offset, false);
    offset += 4;
    if (version !== 1) {
      throw new Error("Unsupported SSHSIG version " + version);
    }
  
    // 3) Read an SSH string: publickey
    const readString = () => {
      const len = dv.getUint32(offset, false);
      offset += 4;
      const bytes = buf.slice(offset, offset + len);
      offset += len;
      return bytes;
    };
    const publickeyBlob = readString();
  
    // 4) Skip namespace, reserved, and hash_algorithm
    readString(); // namespace
    readString(); // reserved
    readString(); // hash_algorithm
  
    // 5) Read the signature field (itself an SSH string)
    const sigBlob = readString();
  
    // --- Now parse publickeyBlob as an SSH-encoded "ssh-rsa" key:
    //    string    "ssh-rsa"
    //    mpint     e
    //    mpint     n
    const pkDv = new DataView(publickeyBlob.buffer);
    let pkOff = 0;
    // skip the algorithm name
    const nameLen = pkDv.getUint32(pkOff, false);
    pkOff += 4 + nameLen;
    // skip the exponent e mpint
    const eLen = pkDv.getUint32(pkOff, false);
    pkOff += 4 + eLen;
    // read the modulus n mpint
    const nLen = pkDv.getUint32(pkOff, false);
    pkOff += 4;
    const nBytes = publickeyBlob.slice(pkOff, pkOff + nLen);
    
    const publicKey = bytesToBigInt(nBytes);
  
    // --- Now parse the sigBlob as:
    //    string   sig-algo (e.g. "rsa-sha2-512")
    //    string   mpint signature
    const sDv = new DataView(sigBlob.buffer);
    let sOff = 0;
    const algoLen = sDv.getUint32(sOff, false);
    sOff += 4 + algoLen;
    const sigLen = sDv.getUint32(sOff, false);
    sOff += 4;
    const sigBytes = sigBlob.slice(sOff, sOff + sigLen);
    const signature = bytesToBigInt(sigBytes);
  
    return { signature, publicKey };
  
    // Helper: big-endian bytes → BigInt
    function bytesToBigInt(bytes) {
      let hex = [];
      for (let b of bytes) {
        hex.push(b.toString(16).padStart(2, "0"));
      }
      return BigInt("0x" + hex.join(""));
    }
}

// -------- PROCESSING FUNCTIONS --------

const MAX_KEYS = 300;

function processKeys(data){
    
     try {
        // Extract all RSA keys from the data
        // TODO: Expand functionality to include other key types
        const rsaKeys = Object.values(data.group_members).flatMap(contributor => 
            contributor.publicKeys
                .filter(key => key.type === 'RSA')
                .map(key => key.key)
        );

        console.log(`Found ${rsaKeys.length} RSA keys to process`);
        
        // Process each RSA key and collect hashed values
        const processedKeys = [];
        
        rsaKeys.forEach((key, index) => {
            try {
                const parsedKey = parseRSAPublicKey(key);
                const keyArray = splitBigIntToChunks(parsedKey);
                processedKeys.push(keyArray);
                
            } catch (error) {
                console.error(`Error processing key ${index + 1}: ${error.message}`);
            }
        });
        if (processedKeys.length > MAX_KEYS){
            console.error("Too many keys to process. Maximum number of allowed keys is 300.");
            process.exit(1);
        }
        while (processedKeys.length < MAX_KEYS) {
            processedKeys.push(processedKeys[0]);
        }
        return processedKeys;
    } catch (error) {
        console.error('Error processing keys:', error);
        throw error;
    }
}

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

    
// -------- MAIN FUNCTION --------
main();

async function main() {     
    program
    .name('send-kudos')
    .description('Send anonymous kudos to 0xPARC group members')
    .version('0.0.0');
    program
    .description('Send anonymous kudos to 0xPARC group members')
    .option('--sig <Path To Signature>', 'Specify path to your double-blind signature', "./github_rsa.sig")
    .option('--path <Path To Json List of Group Public Keys>', 'Specify path to the group public keys', "github_user_list.json")
    .option('--manual', "Manually enter the list of usernames")
    .parse(process.argv);
    const args = program.parse().opts();
    let message = prompt("Message:");
    // what happends if the user does not provide sig and gpk?
    if (!message) {
        console.error("No message provided. Exiting.");
        process.exit(1);
    }
    let signaturePath = args.sig.trim();
    let signature;
    try{
        signature = await fs.readFileSync(signaturePath, 'utf8').trim();
    } catch (error) {
        console.error('Error reading signature file:', error);
        process.exit(1);
    }
    let groupListArray;
    if (args.manual) {
        console.log("Manually entering the list of usernames");
        const prompt = require('prompt-sync')();
        console.log("Enter the list of usernames. Press enter to add a username. Type 'done' when you are finished.");
        groupListArray = [];
        while(true){
            const member = prompt("Enter the next username: ");
            if (member === 'done') {
                break;
            }
            groupListArray.push(member);
        }
        fs.writeFileSync("github_user_list.json", JSON.stringify(groupListArray, null, 2));
        console.log("groupListArray:", groupListArray);
        console.log("Group list saved to github_user_list.json");
    } else{
        const groupList = await fs.readFileSync(args.path, 'utf8');
        groupListArray = JSON.parse(groupList);
    }
    
    const groupPublicKeys = await scrapePublicKeys(groupListArray)
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
        }, "./circuit_files/circuit.wasm", "./circuit_files/circuit_final.zkey");
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

    fetch('http://3.144.19.40:8080', {
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


