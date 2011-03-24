#!/bin/sh

# Compiled for dev
../deps/closure-library/closure/bin/calcdeps.py -i editor.js -p ../deps/closure-library/ -o list | grep closure | xargs cat > dev.js

# Compiled for production
../deps/closure-library/closure/bin/calcdeps.py -i ace/src/ace.js -i ace/src/theme-eclipse.js -i ace/src/mode-html.js -i editor.js -p ../deps/closure-library/ -o compiled  -c ../deps/jar/compiler.jar  > editor.prod.js;
