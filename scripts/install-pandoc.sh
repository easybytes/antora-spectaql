RELEASES_URL='https://github.com/jgm/pandoc/releases'
export PANDOCVERSION=$(curl -I "$RELEASES_URL/latest" | sed -ne 's#Location:.*tag/\(.*\)$#\1#p' | tr -d "\n\r")
echo $PANDOCVERSION
wget $RELEASES_URL/download/$PANDOCVERSION/pandoc-$PANDOCVERSION-linux-amd64.tar.gz
tar xvzf pandoc-$PANDOCVERSION-linux-amd64.tar.gz