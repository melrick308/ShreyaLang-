#include "token.hpp"

const char* tokenKindName(TokenKind k) {
    switch (k) {
        case TokenKind::Let: return "LET";
        case TokenKind::IntKw: return "INT";
        case TokenKind::FloatKw: return "FLOAT";
        case TokenKind::BoolKw: return "BOOL";
        case TokenKind::StringKw: return "STRING";
        case TokenKind::If: return "IF";
        case TokenKind::Else: return "ELSE";
        case TokenKind::While: return "WHILE";
        case TokenKind::Print: return "PRINT";
        case TokenKind::True: return "TRUE";
        case TokenKind::False: return "FALSE";
        case TokenKind::Ident: return "IDENT";
        case TokenKind::IntLit: return "INT_LIT";
        case TokenKind::FloatLit: return "FLOAT_LIT";
        case TokenKind::StringLit: return "STRING_LIT";
        case TokenKind::Plus: return "PLUS";
        case TokenKind::Minus: return "MINUS";
        case TokenKind::Star: return "STAR";
        case TokenKind::Slash: return "SLASH";
        case TokenKind::Percent: return "PERCENT";
        case TokenKind::Lt: return "LT";
        case TokenKind::Le: return "LE";
        case TokenKind::Gt: return "GT";
        case TokenKind::Ge: return "GE";
        case TokenKind::EqEq: return "EQ";
        case TokenKind::NotEq: return "NE";
        case TokenKind::AndAnd: return "AND";
        case TokenKind::OrOr: return "OR";
        case TokenKind::Bang: return "NOT";
        case TokenKind::Assign: return "ASSIGN";
        case TokenKind::LParen: return "LPAREN";
        case TokenKind::RParen: return "RPAREN";
        case TokenKind::LBrace: return "LBRACE";
        case TokenKind::RBrace: return "RBRACE";
        case TokenKind::Semicolon: return "SEMICOLON";
        case TokenKind::Colon: return "COLON";
        case TokenKind::Comma: return "COMMA";
        case TokenKind::EndOfFile: return "EOF";
    }
    return "?";
}
