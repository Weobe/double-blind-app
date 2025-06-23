const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const { Command } = require('commander');
// Initialize Octokit with GitHub token
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});
const program = new Command();

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
    console.log("groupListArray:", groupListArray);
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

// Example usage
async function main() {
    program
    .name('edit-kudos-group')
    .description('Change the list of github usernames in the kudos group signature')
    .version('0.0.0');
    program
    .description('Change the list of github usernames in the kudos group signature')
    .option('--path <Path To Json List of Group Public Keys>', 'Specify path to the group public keys', "github_user_list.json")
    .option('--manual', "Manually enter the list of usernames")
    .parse(process.argv);

    const args = program.parse().opts();
    let groupListArray;
    if (args.manual) {
        console.log("Manually entering the list of usernames");
        const prompt = require('prompt-sync')();
        console.log("Enter the list of usernames. Press enter to add a username. Press 'done' when you are finished.");
        groupListArray = [];
        while(true){
            const member = prompt("Enter the next username: ");
            if (member === 'done') {
                break;
            }
            groupListArray.push(member);
        }
        console.log("groupListArray:", groupListArray);
    } else{
        const groupList = await fs.readFile(args.path, 'utf8');
        groupListArray = JSON.parse(groupList);
    }
    
    const results = await scrapePublicKeys(groupListArray);
    
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
