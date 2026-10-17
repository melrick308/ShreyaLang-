// --ast output: an indented tree (text) or nested objects (JSON).
#pragma once

#include <string>

#include "ast.hpp"
#include "json.hpp"

std::string printAst(const Program& program);
Json astToJson(const Program& program);
