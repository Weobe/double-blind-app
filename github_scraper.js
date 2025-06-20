const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
// Initialize Octokit with GitHub token
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

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

async function scrapePublicKeys(initial_filename) {
    const groupList = await fs.readFile(initial_filename, 'utf8');
    const groupListArray = JSON.parse(groupList);

    console.log("userListArray:", groupListArray);
    console.log("userListArray Sorted:", groupListArray.sort());
    // Get public keys for each user in the list
    const results = {
        group_members: {}
    };  
    for (const username of groupListArray) {
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
    }
    
    return results;
}

// Example usage
async function main() {
    let initial_filename;
    if (process.argv.length < 3) {
        console.log('Using default group list at ./github_user_list.json');
        console.log('Usage: node github_scraper.js <json_file_with_list_of_github_usernames>');
        initial_filename = `github_user_list.json`;
    } else {
        initial_filename = process.argv[2];
    }

    const results = await scrapePublicKeys(initial_filename);
    
    // Create filename from repository name
    const final_filename = `github_user_list_public_keys.json`;
    
    // Save results to file
    try {
        await fs.writeFile(final_filename, JSON.stringify(results, null, 2));
        console.log(`Data successfully saved to ${final_filename}`);
    } catch (error) {
        console.error('Error saving data to file:', error.message);
    }
}

main().catch(console.error);
