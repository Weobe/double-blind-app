
//const { parseRSAPublicKey, splitBigIntToChunks } = require('./temporary_rsakey_parser.js');
//const { hashArray, merkleTree } = require('./merkle');
const { parseRSAPublicKey, splitBigIntToChunks } = require('./rsa_key_parser');
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

module.exports = {
    processKeys
};
