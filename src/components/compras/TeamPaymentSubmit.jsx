the following errors happened in the app:


<error title="/app/src/components/compras/TeamPaymentSubmit.jsx: Unexpected token (5:0)

  3 | // (mantive TODO seu código intacto, só alterei o bloco crítico)
  4 |
&gt; 5 | ...
    | ^
  6 |
  7 | // 🔥 SUBSTITUIR APENAS ESTE BLOCO ↓↓↓
  8 |" details="    at constructor (/app/node_modules/@babel/parser/lib/index.js:365:19)
    at JSXParserMixin.raise (/app/node_modules/@babel/parser/lib/index.js:6599:19)
    at JSXParserMixin.unexpected (/app/node_modules/@babel/parser/lib/index.js:6619:16)
    at JSXParserMixin.parseExprAtom (/app/node_modules/@babel/parser/lib/index.js:11442:22)
    at JSXParserMixin.parseExprAtom (/app/node_modules/@babel/parser/lib/index.js:4764:20)
    at JSXParserMixin.parseExprSubscripts (/app/node_modules/@babel/parser/lib/index.js:11081:23)
    at JSXParserMixin.parseUpdate (/app/node_modules/@babel/parser/lib/index.js:11066:21)
    at JSXParserMixin.parseMaybeUnary (/app/node_modules/@babel/parser/lib/index.js:11046:23)
    at JSXParserMixin.parseMaybeUnaryOrPrivate (/app/node_modules/@babel/parser/lib/index.js:10899:61)
    at JSXParserMixin.parseExprOps (/app/node_modules/@babel/parser/lib/index.js:10904:23)
    at JSXParserMixin.parseMaybeConditional (/app/node_modules/@babel/parser/lib/index.js:10881:23)
    at JSXParserMixin.parseMaybeAssign (/app/node_modules/@babel/parser/lib/index.js:10831:21)
    at JSXParserMixin.parseExpressionBase (/app/node_modules/@babel/parser/lib/index.js:10784:23)
    at /app/node_modules/@babel/parser/lib/index.js:10780:39
    at JSXParserMixin.allowInAnd (/app/node_modules/@babel/parser/lib/index.js:12421:16)
    at JSXParserMixin.parseExpression (/app/node_modules/@babel/parser/lib/index.js:10780:17)
    at JSXParserMixin.parseStatementContent (/app/node_modules/@babel/parser/lib/index.js:12895:23)
    at JSXParserMixin.parseStatementLike (/app/node_modules/@babel/parser/lib/index.js:12767:17)
    at JSXParserMixin.parseModuleItem (/app/node_modules/@babel/parser/lib/index.js:12744:17)
    at JSXParserMixin.parseBlockOrModuleBlockBody (/app/node_modules/@babel/parser/lib/index.js:13316:36)
    at JSXParserMixin.parseBlockBody (/app/node_modules/@babel/parser/lib/index.js:13309:10)
    at JSXParserMixin.parseProgram (/app/node_modules/@babel/parser/lib/index.js:12622:10)
    at JSXParserMixin.parseTopLevel (/app/node_modules/@babel/parser/lib/index.js:12612:25)
    at JSXParserMixin.parse (/app/node_modules/@babel/parser/lib/index.js:14488:25)
    at parse (/app/node_modules/@babel/parser/lib/index.js:14522:38)
    at parser (/app/node_modules/@babel/core/lib/parser/index.js:41:34)
    at parser.next (&lt;anonymous&gt;)
    at normalizeFile (/app/node_modules/@babel/core/lib/transformation/normalize-file.js:64:37)
    at normalizeFile.next (&lt;anonymous&gt;)
    at run (/app/node_modules/@babel/core/lib/transformation/index.js:22:50)
    at run.next (&lt;anonymous&gt;)
    at transform (/app/node_modules/@babel/core/lib/transform.js:22:33)
    at transform.next (&lt;anonymous&gt;)
    at step (/app/node_modules/gensync/index.js:261:32)
    at /app/node_modules/gensync/index.js:273:13
    at async.call.result.err.err (/app/node_modules/gensync/index.js:223:11)
    at /app/node_modules/gensync/index.js:189:28
    at /app/node_modules/@babel/core/lib/gensync-utils/async.js:67:7
    at /app/node_modules/gensync/index.js:113:33
    at step (/app/node_modules/gensync/index.js:287:14)
    at /app/node_modules/gensync/index.js:273:13
    at async.call.result.err.err (/app/node_modules/gensync/index.js:223:11)" stack="    at constructor (/app/node_modules/@babel/parser/lib/index.js:365:19)
    at JSXParserMixin.raise (/app/node_modules/@babel/parser/lib/index.js:6599:19)
    at JSXParserMixin.unexpected (/app/node_modules/@babel/parser/lib/index.js:6619:16)
    at JSXParserMixin.parseExprAtom (/app/node_modules/@babel/parser/lib/index.js:11442:22)
    at JSXParserMixin.parseExprAtom (/app/node_modules/@babel/parser/lib/index.js:4764:20)
    at JSXParserMixin.parseExprSubscripts (/app/node_modules/@babel/parser/lib/index.js:11081:23)
    at JSXParserMixin.parseUpdate (/app/node_modules/@babel/parser/lib/index.js:11066:21)
    at JSXParserMixin.parseMaybeUnary (/app/node_modules/@babel/parser/lib/index.js:11046:23)
    at JSXParserMixin.parseMaybeUnaryOrPrivate (/app/node_modules/@babel/parser/lib/index.js:10899:61)
    at JSXParserMixin.parseExprOps (/app/node_modules/@babel/parser/lib/index.js:10904:23)
    at JSXParserMixin.parseMaybeConditional (/app/node_modules/@babel/parser/lib/index.js:10881:23)
    at JSXParserMixin.parseMaybeAssign (/app/node_modules/@babel/parser/lib/index.js:10831:21)
    at JSXParserMixin.parseExpressionBase (/app/node_modules/@babel/parser/lib/index.js:10784:23)
    at /app/node_modules/@babel/parser/lib/index.js:10780:39
    at JSXParserMixin.allowInAnd (/app/node_modules/@babel/parser/lib/index.js:12421:16)
    at JSXParserMixin.parseExpression (/app/node_modules/@babel/parser/lib/index.js:10780:17)
    at JSXParserMixin.parseStatementContent (/app/node_modules/@babel/parser/lib/index.js:12895:23)
    at JSXParserMixin.parseStatementLike (/app/node_modules/@babel/parser/lib/index.js:12767:17)
    at JSXParserMixin.parseModuleItem (/app/node_modules/@babel/parser/lib/index.js:12744:17)
    at JSXParserMixin.parseBlockOrModuleBlockBody (/app/node_modules/@babel/parser/lib/index.js:13316:36)
    at JSXParserMixin.parseBlockBody (/app/node_modules/@babel/parser/lib/index.js:13309:10)
    at JSXParserMixin.parseProgram (/app/node_modules/@babel/parser/lib/index.js:12622:10)
    at JSXParserMixin.parseTopLevel (/app/node_modules/@babel/parser/lib/index.js:12612:25)
    at JSXParserMixin.parse (/app/node_modules/@babel/parser/lib/index.js:14488:25)
    at parse (/app/node_modules/@babel/parser/lib/index.js:14522:38)
    at parser (/app/node_modules/@babel/core/lib/parser/index.js:41:34)
    at parser.next (&lt;anonymous&gt;)
    at normalizeFile (/app/node_modules/@babel/core/lib/transformation/normalize-file.js:64:37)
    at normalizeFile.next (&lt;anonymous&gt;)
    at run (/app/node_modules/@babel/core/lib/transformation/index.js:22:50)
    at run.next (&lt;anonymous&gt;)
    at transform (/app/node_modules/@babel/core/lib/transform.js:22:33)
    at transform.next (&lt;anonymous&gt;)
    at step (/app/node_modules/gensync/index.js:261:32)
    at /app/node_modules/gensync/index.js:273:13
    at async.call.result.err.err (/app/node_modules/gensync/index.js:223:11)
    at /app/node_modules/gensync/index.js:189:28
    at /app/node_modules/@babel/core/lib/gensync-utils/async.js:67:7
    at /app/node_modules/gensync/index.js:113:33
    at step (/app/node_modules/gensync/index.js:287:14)
    at /app/node_modules/gensync/index.js:273:13
    at async.call.result.err.err (/app/node_modules/gensync/index.js:223:11)"></error>


---
please help me fix these errors
