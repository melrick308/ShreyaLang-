# ShreyaLang mini compiler - build file (GNU make).
#
#   make            build build/shreyalang (build/shreyalang.exe on Windows)
#   make test       build and run the test suite
#   make web        build and start the web frontend (http://127.0.0.1:8080)
#   make test-web   check the Learn course content against the compiler
#   make clean      remove build/
#
# Tools can be overridden, e.g.  make CXX=clang++ BISON=/opt/bison/bin/bison

CXX      ?= g++
FLEX     ?= flex
BISON    ?= bison
PYTHON   ?= python3
NODE     ?= node
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -pedantic
CPPFLAGS += -Isrc -Ibuild/gen -MMD -MP

ifeq ($(OS),Windows_NT)
  EXE := .exe
  # Static link so the executable runs outside the MSYS2 shell (e.g. from
  # PowerShell or the web frontend) without the MinGW runtime DLLs on PATH.
  # The default Windows main-thread stack is 2 MB; use 8 MB like Linux/macOS
  # so the deepest program the parser accepts can be walked recursively.
  LDFLAGS += -static -Wl,--stack,8388608
  PYTHON := python
endif

TARGET  := build/shreyalang$(EXE)
SOURCES := $(wildcard src/*.cpp)
OBJECTS := $(patsubst src/%.cpp,build/obj/%.o,$(SOURCES)) build/obj/lexer.o build/obj/parser.o

.PHONY: all test web test-web clean

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CXX) $(CXXFLAGS) $(LDFLAGS) -o $@ $(OBJECTS)

build/gen/lexer.cpp: src/lexer.l
	@mkdir -p build/gen
	$(FLEX) -o $@ $<

build/gen/parser.cpp: src/parser.y
	@mkdir -p build/gen
	$(BISON) -Wall -Werror -o $@ $<

build/obj/%.o: src/%.cpp
	@mkdir -p build/obj
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c -o $@ $<

build/obj/%.o: build/gen/%.cpp
	@mkdir -p build/obj
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c -o $@ $<

test: $(TARGET)
	$(PYTHON) tests/run_tests.py --bin $(TARGET)

web: $(TARGET)
	$(NODE) web/server.js

test-web: $(TARGET)
	$(NODE) web/test_lessons.mjs $(TARGET)

clean:
	rm -rf build

-include $(OBJECTS:.o=.d)
