echo "0xPARC" | ssh-keygen -Y sign -n file -f ~/.ssh/github > content.sig
ssh-keygen -Y sign -n file -f ~/.ssh/github > github_rsa.sig