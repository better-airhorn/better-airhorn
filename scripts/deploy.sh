set -e
set -x


scp ./bot.zip server:~/
echo "uploaded artifact"
echo "unzipping and restarting bot"
ssh server "source ~/.nvm/nvm.sh && mv builds/bot/.env builds/bot.env && rm -rf builds/bot/* && mv builds/bot.env builds/bot/.env  && unzip -o bot.zip && rm bot.zip && pm2 restart bot"
