set -e
set -x


scp ./bot.zip server:~/
echo "uploaded artifact"
echo "unzipping and restarting bot"
ssh server "source ~/.nvm/nvm.sh && rm -rf builds/bot/* && unzip -o bot.zip && rm bot.zip && pm2 restart bot"
