set -e
set -x

scp ./bot.zip server:~/
echo "uploaded artifact"
echo "unzipping and restarting bot"
ssh server << EOF
    unzip -o bot.zip
    pm2 restart bot
EOF
