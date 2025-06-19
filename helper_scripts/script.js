import { groth16 } from "snarkjs";

document.addEventListener('DOMContentLoaded', function() {
    const actionButton = document.getElementById('actionButton');
    const expandableSections = document.getElementById('expandableSections');
    const contributorsContent = document.getElementById('contributorsContent');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    const repoUrlInput = document.getElementById('repoUrl');
    const messageInput = document.getElementById('message');
    const signatureInput = document.getElementById('signature');
    const signatureInputContainer = document.getElementById('signatureInputContainer');
    const modeToggle = document.getElementById('modeToggle');
    const resultMessage = document.getElementById('resultMessage');
    const fillDefaultsButton = document.getElementById('fillDefaults');

    // Function to auto-resize textarea
    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
    }

    // Add input event listeners for auto-resizing
    messageInput.addEventListener('input', () => autoResizeTextarea(messageInput));
    signatureInput.addEventListener('input', () => autoResizeTextarea(signatureInput));

    // Initial resize for any pre-filled content
    autoResizeTextarea(messageInput);
    autoResizeTextarea(signatureInput);

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
            console.log('Message:', message);
            //console.log('Message as BigInt:', formatHexString(bigIntToHex(messageAsBigInt)));
            return splitBigIntToChunks(messageAsBigInt);
        } catch (error) {
            console.error('Error processing message:', error);
            throw new Error('Failed to process message');
        }
    }

    // Function to update UI based on mode
    function updateUIMode(isVerifyMode) {
        const label = signatureInputContainer.querySelector('label');
        const placeholder = signatureInput.getAttribute('placeholder');
        
        if (isVerifyMode) {
            label.textContent = 'Proof';
            signatureInput.setAttribute('placeholder', 'Enter your proof here...');
            actionButton.textContent = 'Verify Proof';
            loadingText.textContent = 'Verifying Proof';
        } else {
            label.textContent = 'Signature';
            signatureInput.setAttribute('placeholder', 'Enter your signature here...');
            actionButton.textContent = 'Generate Proof';
            loadingText.textContent = 'Generating Proof';
        }
    }

    // Initialize UI mode
    updateUIMode(modeToggle.checked);

    // Handle mode toggle
    modeToggle.addEventListener('change', function() {
        updateUIMode(this.checked);
        resultMessage.style.display = 'none';
    });

    function displayContributors(data) {
        let html = '';
        
        for (const [username, info] of Object.entries(data.contributors)) {
            html += `
                <div class="contributor-item">
                    <h5>${username}</h5>
                    <p class="text-muted">Contributions: ${info.contributions}</p>
                    <div class="public-keys">
                        ${info.publicKeys.map(key => `
                            <div class="mb-2">
                                <small class="text-muted">${key.title}</small>
                                <div class="public-key">${key.key}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        contributorsContent.innerHTML = html;
        expandableSections.style.display = 'block';
        
        // Get the accordion button and collapse element
        const accordionButton = document.querySelector('.accordion-button');
        const contributorsCollapse = document.getElementById('contributorsCollapse');
        
        // Create a new bootstrap collapse instance if it doesn't exist
        if (!contributorsCollapse._bsCollapse) {
            new bootstrap.Collapse(contributorsCollapse, {
                toggle: false
            });
        }
        
        // Show the collapse
        bootstrap.Collapse.getInstance(contributorsCollapse).show();
        
        // Update button state
        accordionButton.classList.add('collapsed');
        accordionButton.setAttribute('aria-expanded', 'true');
    }

    // Function to process and display signature
    function processSignature(signature) {
        if (!signature) {
            return;
        }
        let parsedSignatureChunks;
        try {
            const parsed = parseSSHSignature(signature);
            //console.log('Parsed signature:', parsed);
            
            parsedSignatureChunks = {
                signature: splitBigIntToChunks(parsed.signature),
                publicKey: splitBigIntToChunks(parsed.publicKey),
            };
            //console.log('Public Key:', formatHexString(bigIntToHex(parsed.publicKey)));
            //console.log('Signature:', formatHexString(bigIntToHex(parsed.signature)));
        } catch (error) {
            console.error('Error parsing signature:', error);
            parsedSignatureChunks = [];
        }   
        return parsedSignatureChunks;
    }


    actionButton.addEventListener('click', async function() {
        const repoUrl = repoUrlInput.value.trim();
        const message = messageInput.value.trim();
        const input = signatureInput.value.trim();
        const isVerifyMode = modeToggle.checked;
        const doubleBlindMessage = "0xPARC"
        if (!repoUrl) {
            alert('Please enter a repository URL');
            return;
        }

        // Show loading spinner
        loadingSpinner.style.display = 'block';
        expandableSections.style.display = 'none';
        resultMessage.style.display = 'none';

        try {
            // Call the backend API to fetch repo data
            const response = await fetch('/fetch-repo-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ repoUrl })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch repository data');
            }

            const data = await response.json();
            
            // Display contributors
            displayContributors(data);
            expandableSections.style.display = 'block';

            if (isVerifyMode) {
                // Verify mode
                const proof = JSON.parse(input);
                console.log(proof);
                const parsedHashedMessage = await processMessage(message);
                const parsedHashedDoubleBlindMessage = await processMessage(doubleBlindMessage);
                const publicKeys = processKeys(data);
                const vkey = await fetch("circuit_files/verification_key.json").then( function(res) {
                    return res.json();
                });
                const publicSignals = [...parsedHashedMessage, ...parsedHashedDoubleBlindMessage, ...publicKeys.flat(2)];
                
                console.log(publicSignals);
                const isValid = await groth16.verify(vkey, publicSignals, proof);
                resultMessage.textContent = isValid ? 'Proof Verified Successfully!' : 'Proof Verification Failed';
                resultMessage.className = `alert alert-${isValid ? 'success' : 'danger'} text-center mb-4`;
                resultMessage.style.display = 'block';
            } else {
                // Generate mode
                const parsedHashedMessage = await processMessage(message);
                const parsedHashedDoubleBlindMessage = await processMessage(doubleBlindMessage);
                const processedSignature = await processSignature(input);
                const parsedSignature = processedSignature.signature;
                const parsedPublicKey = processedSignature.publicKey;
                const publicKeys = processKeys(data);
                const { proof, publicSignals } = await groth16.fullProve({
                    message: parsedHashedMessage,
                    doubleBlindMessage: parsedHashedDoubleBlindMessage,
                    publicKeys: publicKeys,
                    signature: parsedSignature,
                    correctKey: parsedPublicKey,
                }, "circuit_files/circuit.wasm", "circuit_files/circuit_final.zkey");

                // Display the proof
                const proofStr = JSON.stringify({proof: proof, publicSignals: publicSignals}, null, 2);

                resultMessage.innerHTML = `
                    <div class="alert alert-success text-center mb-4">
                        Proof Generated Successfully!
                    </div>
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Generated Proof</h5>
                        </div>
                        <div class="card-body">
                            <pre class="mb-0"><code>${proofStr}</code></pre>
                        </div>
                    </div>
                `;
                resultMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Error:', error);
            resultMessage.textContent = 'Error: ' + error.message;
            resultMessage.className = 'alert alert-danger text-center mb-4';
            resultMessage.style.display = 'block';
        } finally {
            loadingSpinner.style.display = 'none';
        }
    });

    fillDefaultsButton.addEventListener('click', function() {
        repoUrlInput.value = 'https://github.com/psquare1/repo-group-sign';
        messageInput.value = '0xPARC';
        
        if (modeToggle.checked) {
            // Verify mode
            signatureInput.value = `{
    "pi_a": [
      "10688342254764554387616963359130561217794980912753178878523516682639938210665",
      "17560464434943714692560955169248545936038230366699466724296757178932235929805",
      "1"
    ],
    "pi_b": [
      [
        "21680135545008477446680720964340613336190158537609947487737023885651662242874",
        "387542033237198917483609879680728719027034428455552418580769667257113602794"
      ],
      [
        "4904595159745649749938850769347091111571701354634447411939328227980740139874",
        "9490067439004084841892707092623130906746387342520948193941733493025026823452"
      ],
      [
        "1",
        "0"
      ]
    ],
    "pi_c": [
      "16835040348540918851361768478547570520368804858673745922629189211944483653462",
      "19387472165883046468897984153383369121033003001082703290024892487960590823828",
      "1"
    ],
    "protocol": "groth16",
    "curve": "bn128"
  }`;
        } else {
            // Generate mode
            signatureInput.value = `U1NIU0lHAAAAAQAAAhcAAAAHc3NoLXJzYQAAAAMBAAEAAAIBAMeroewqNQMc3NrpCXX/WzBvDUB/b27cv3+lIu3EH+CUyNfcP6cV/rpH9HYAhVEpnn50vIrDFZs1Rf0k1te/inCNQKMjqSHSSFNE6XUy29BXSNFda/YoUyDhtfJv/69m9XEZBnCCO3Lx3pVnG1j1LaKn00rhftceZcMx5dvB4euWUkzdWQLpk11qwtdGv+I1/cmgy5ETFgLkJj2RDZEtVtq/cBEX+R2GV9CwHwZ3lJ/E2QPYY0N2knwQCmA0AGm63qc4LziXO1erIpaMVUAsPx2mWrRHlQbjBDFuJYgoORtF3YaZbJdUrW39Tf0BWFZsutmRn9VX+1mZctbEMmuIAU1zXrymBXeCdjyLJibed+LnzGPVe6hltAutWMVij9dBaMGQi+/p5VkBhOnmoPAsUAfhgHuk9cTiMLJtnR+JuE5dKlKi9BscaOQQ79Ih69gEmysqdmp+nOZbs3kNxz+7lidJt0EYmhkCTBwwxmmRrY1xagHORQWz/5MU/OFDh0d+mYcqsONYk9eAxCZhPEOg8Nn/LsvgcUO05NoTS8RHwQ4OImk36lCdN5ql/dy1GU1uu3zh9l5fQsw/Lp8q8sXYU2eVWESrFeduDWPG6Y34dp5vrLoWW/oRHLM+LXPJzYdjezD010DEkbzk78tqIlBmJo01TEjQQW/znoVUoLQ2VPd1AAAABGZpbGUAAAAAAAAABnNoYTUxMgAAAhQAAAAMcnNhLXNoYTItNTEyAAACAIR3B+M+wyOfyw6wNVLiSCp5AjEcs6zczGpSSl8ExxLQ7nMdZw9oL20Z39mq8Hfv8bbXOntUqqRk2hFH8D5HiDzqEELNVps4BqRgrOC7u0LMlTs6CPWBFEcI4FP4uzS36+uOppVln7XMYNZX3iVTVSjKcB5EBxpCULoqfNN8ee/t0/bq1ZCRazYvzlTOoXQf6iEgeTQTaR9xLDh3YueVUZRWfl4p2PhgKdawH56BXk9T6trIMzMIhuAH5qxJ4ZyrEdJh4qgg5KKDzkN/k5w3Is1bTgTNzGOBqN5EFXIizWt5xInbCo9diGT6zjyFjxLSWm+79KrW+u0aq7zwdwBKzBBM5oiymAFfCMllxY2NaqHdgQ1xMqk9FOyBCFVnqBDzGhApTMHlaWoEHkKlB49RmURUItcn09fzCxmXiP267dgf9lvTkvpDqQkQpRe02vhAOWRYTIer+AtWLeIFYvE5N6GDR9guXww9+Ka9Hn+xm2jrkqFXuD2y33h0P2NlD3t3EMyatvfPeGwWwGh6upg++BWXU+1QvFjWQup0fXH60utOcdGauMn42jf7Ifwg/MpICBRaYkmcrJfzYRD5DTiSy9svk0Bt4vy1iUlBrRY8FrBLEy3CurvpAx+o1I/i0smCHTAebx7U7NmmedC12O3fqS7jpD8E3h5jIGfuEbHue5Ug`;
        }
        
        // Trigger auto-resize after setting values
        autoResizeTextarea(messageInput);
        autoResizeTextarea(signatureInput);
    });
}); 