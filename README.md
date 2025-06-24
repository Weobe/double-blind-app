A user-friendly command-line tool for sending kudos to the 0xPARC kudos mailing list. Currently only compatible with Linux and MacOS.


# Installation
1. Make sure you install node.js v22.16.0 from this link: https://nodejs.org/en/download
2. Clone this repo
   ```
   git clone https://github.com/Weobe/double-blind-app.git
   cd double-blind-app
   ```
3. Run init.sh
   ```
   bash init.sh
   ```
4. Add an RSA-4096 Key to your GitHub account following the instructions in this link: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account
5. Create a signature of the text `0xPARC` with your GitHub private key using this command:
  ```
  ssh-keygen -Y sign -n file -f <PATH_TO_YOUR_GITHUB_KEY> > github_rsa.sig
  ```
  When prompted, enter your passkey (if any) and then type `0xPARC` in the standard input. To finish, press Ctrl+D / Control+D twice without pressing Enter (Pressing Enter adds a new line to the input which would change the text you are signing)
6. Place `github_rsa.sig` in the `double-blind-app` folder

# Usage
You can send kudos from the terminal using the command `send kudos`
```
send-kudos
Message: <YOUR_KUDOS_MESSAGE e.g. Kudos to Liza for helping me with the project!>
Found 4 RSA keys to process
Generating proof...
Success: Email sent! Server said: ...
```

To change who is included in group signature, edit `github_user_list.json` or add the group members manually by running
```
edit-kudos-group --manual
```

Use option `--help` for more information about each command

The list of kudos' sent far can be found here: http://3.144.19.40:8080/

The backbone of the project is copied from: https://github.com/psquare1/repo-group-sign/
