> base44-app@0.0.0 build
> vite build --mode production

✗ Build failed in 4.93s
error during build:
[vite:esbuild] Transform failed with 1 error:
/app/src/components/reports/premium/PremiumReportLayout.jsx:463:24: ERROR: Expected "(" but found "de"
file: /app/src/components/reports/premium/PremiumReportLayout.jsx:463:24

Expected "(" but found "de"
461|  
462|  
463|  function PremiumArquivo de imagemThumbnail({ photo, activity }) {
   |                          ^
464|    const imageUrl =
465|      photo?.url ||

    at failureErrorWithLog (/app/node_modules/esbuild/lib/main.js:1467:15)
    at /app/node_modules/esbuild/lib/main.js:736:50
    at responseCallbacks.<computed> (/app/node_modules/esbuild/lib/main.js:603:9)
    at handleIncomingPacket (/app/node_modules/esbuild/lib/main.js:658:12)
    at Socket.readFromStdout (/app/node_modules/esbuild/lib/main.js:581:7)
    at Socket.emit (node:events:524:28)
    at addChunk (node:internal/streams/readable:561:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
    at Readable.push (node:internal/streams/readable:392:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:191:23)
