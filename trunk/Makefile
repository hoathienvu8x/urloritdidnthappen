CLOSURE_COMPILER=deps/closure-compiler
CLOSURE_COMPILER_JAR=deps/jar/compiler.jar
CLOSURE_LIBRARY=deps/closure-library
CALC_DEPS=$(CLOSURE_LIBRARY)/closure/bin/calcdeps.py

all: compiler editor

clean: clean-compiler

editor:
	$(CALC_DEPS) -p $(CLOSURE_LIBRARY) \
			-i static/require.js -i static/editor.js -o script | \
			java -jar $(CLOSURE_COMPILER_JAR) \
			--compilation_level=ADVANCED_OPTIMIZATIONS \
			--js_output_file static/editor.prod.js

compiler:
	mkdir -p deps/jar
	cd $(CLOSURE_COMPILER) ; \
			ant -f build.xml ; \
			cp build/compiler.jar ../jar

clean-compiler:
	rm -rf $(CLOSURE_COMPILER)/build
