CLOSURE_COMPILER=deps/closure-compiler
CLOSURE_COMPILER_JAR=deps/jar/compiler.jar
CLOSURE_LIBRARY=deps/closure-library/
CALC_DEPS=$(CLOSURE_LIBRARY)/closure/bin/calcdeps.py

all: editor

editor:
	mkdir -p build
	cp app.yaml main.py build

	mkdir -p build/static
	cp static/editor.css build/static

	mkdir -p build/templates
	cp templates/base.html templates/editor.html build/templates

	$(CALC_DEPS) -p $(CLOSURE_LIBRARY) \
			-i static/require.js -i static/editor.js -o script | \
			java -jar $(CLOSURE_COMPILER_JAR) \
			--compilation_level=ADVANCED_OPTIMIZATIONS \
			--js_output_file build/static/editor.js

clean:
	rm -rf build

compiler:
	mkdir -p deps/jar
	cd $(CLOSURE_COMPILER) ; \
			ant -f build.xml ; \
			cp build/compiler.jar ../jar ; \
			rm -rf build
