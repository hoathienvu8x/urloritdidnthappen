#!/bin/sh

# Compiled for dev
../deps/closure-library/closure/bin/calcdeps.py -i editor.js -p ../deps/closure-library/ -o list | grep closure | xargs cat > dev.js

# Compiled for production
../deps/closure-library/closure/bin/calcdeps.py -i editor.js -p ../deps/closure-library/ -o compiled -f "--compilation_level=ADVANCED_OPTIMIZATIONS" -c ../deps/jar/compiler.jar  > editor.prod.js;
