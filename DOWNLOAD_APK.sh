#!/bin/bash
# Decode FunctionGram.apk from base64
# Usage: cat FunctionGram.apk.b64 | base64 -d > FunctionGram.apk
# Or if you have the .b64 file:
base64 -d FunctionGram.apk.b64 > FunctionGram.apk
echo "APK decoded: $(ls -lh FunctionGram.apk)"
# Verify
unzip -l FunctionGram.apk | head -n 20
