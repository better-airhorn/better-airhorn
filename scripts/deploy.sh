set -e
set -x

scp ./bot.zip server:~/
echo "uploaded artifact"
ssh server << EOF
    unzip -o bot.zip
    pm2 restart bot
EOF
