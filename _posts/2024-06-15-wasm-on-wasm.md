---
layout: post
title: WasmランタイムをWasm化してWasmランタイムで動かす(Wasm Runtime on Wasm Runtime)
date: 15-06-2024
description:
tags: WebAssembly
categories: JA-post
giscus_comments: true
related_posts: true
pretty_table: true
---

## 1. はじめに
Wasmは、あらゆる言語で記述されたプログラムをWasmにコンパイルすることで、Wasmランタイムが動作する計算機であればどこでもプログラムが実行できるポータブルな環境である。
JavaのWrite Once, Run Anywhereみたいなことをあらゆる言語で実現できる。
WasmランタイムはWasmtimeやWasmer, WasmEdgeなどクラウドや組み込み、エッジ環境などに合わせた多様な実装がある。

ある日ふと、WasmランタイムをWasmにコンパイルして別のWasmランタイムで実行できるんだろうか？と気になった。ソースコードは改変せず、ビルドスクリプトの変更程度でなんとかなるか試してみた。

## 2. WasmランタイムをWasmビルドしてみる
### 2.1 [Wasmtime](https://github.com/bytecodealliance/wasmtime)
WasmとWASIの実質的なリファレンス実装。

```
cargo build --target wasm32-wasi
...
error: failed to run custom build command for `cranelift-codegen v0.109.0 (/home/chikuwait/wasmtime/cranelift/codegen)`

Caused by:
  process didn't exit successfully: `/home/chikuwait/wasmtime/target/debug/build/cranelift-codegen-3ef08dfd75fb413b/build-script-build` (exit status: 101)
  --- stderr
  thread 'main' panicked at cranelift/codegen/build.rs:50:53:
  error when identifying target: "no supported isa found for arch `wasm32`"
  note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

```
Wasmtimeは、Rustで実装されており、WasmモジュールをJITコンパイルして実行する。
JITコンパイルにはCraneliftを使用しており、中間コード(Cranelift IR)からマシンコードを生成するためのcranelift-codegen Crateのビルドに失敗する(WasmバイトコードからWasmバイトコードにコンパイルすることになるので、おかしなことになる)。

参考: [cargo wasi run doesn't work - error with cranelift-codegen v0.96.3 #6540 - bytecodealliance/wasmtime](https://github.com/bytecodealliance/wasmtime/issues/6540)　

### 2.2 [Wasmi](https://github.com/wasmi-labs/wasmi)
インタプリタ方式を採用したWasmランタイム。軽量で組み込み・IoT環境での使用を意識している。

```
cargo build --target wasm32-wasi

...
error: failed to run custom build command for `cranelift-codegen v0.105.4`

Caused by:
  process didn't exit successfully: `/home/chikuwait/wasmi/target/debug/build/cranelift-codegen-a4177e815286ec07/build-script-build` (exit status: 101)
  --- stderr
  thread 'main' panicked at /home/chikuwait/.cargo/registry/src/index.crates.io-6f17d22bba15001f/cranelift-codegen-0.105.4/build.rs:48:53:
  error when identifying target: "no supported isa found for arch `wasm32`"
  note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
warning: build failed, waiting for other jobs to finish...
```
WasmiはWasmtimeのcrateを使用して実装されているため、Wasmtimeと同様にビルドに失敗する。

### 2.3 [Wasmer](https://github.com/wasmerio/wasmer)
ラップトップ(Win/Mac)から、クラウド、エッジなどあらゆる環境でWasmを実行するためのランタイム。WASIを拡張してPOSIXの多様な機能に対応するオリジナルなインターフェースであるWASIXをサポートしている。
```
cargo build --target wasm32-wasi --manifest-path lib/cli/Cargo.toml
...
error[E0433]: failed to resolve: use of undeclared crate or module `platform`
  --> /home/chikuwait/.cargo/registry/src/index.crates.io-6f17d22bba15001f/rustls-native-certs-0.6.3/src/lib.rs:58:42
   |
58 |     load_certs_from_env().unwrap_or_else(platform::load_native_certs)
   |                                          ^^^^^^^^ use of undeclared crate or module `platform`

```
Wasmerは、TLSライブラリのRustlsを使用しているが、これは各プラットフォーム(Windows, macOS, Linux)ネイティブの証明書ストアを使用する。
そのため、Wasmはサポートされていない。

参考：[use of undeclared crate or module platform #92 - rustls/rustls-native-certs](https://github.com/rustls/rustls-native-certs/issues/92)

### 2.4 [WasmEdge](https://github.com/WasmEdge/WasmEdge)
OCI(Open Container Initiative)に対応しているクラウドネイティブなWasmランタイム。
クラウドネイティブ環境（サーバレスやマイクロサービス）やエッジ環境での実行を想定している。

```
cmake -DCMAKE_C_COMPILER="/home/chikuwait/wasi-sdk/bin/clang" -D CMAKE_CXX_COMPILER="/home/chikuwait/wasi-sdk/bin/clang++" .. -D CMAKE_CXX_COMPILER_TARGET=wasm32-wasi-threads -D CMAKE_C_COMPILER_TARGET=wasm32-wasi-threads

...

CMake Error at /usr/lib/llvm-14/cmake/AddLLVM.cmake:552 (add_library):
  Target "wasmedgeLLVM" links to target "ZLIB::ZLIB" but the target was not
  found.  Perhaps a find_package() call is missing for an IMPORTED target, or
  an ALIAS target is missing?
Call Stack (most recent call first):
  lib/llvm/CMakeLists.txt:50 (llvm_add_library)


CMake Error at cmake/Helper.cmake:184 (add_library):
  Target "wasmedgeVM" links to target "ZLIB::ZLIB" but the target was not
  found.  Perhaps a find_package() call is missing for an IMPORTED target, or
  an ALIAS target is missing?
Call Stack (most recent call first):
  lib/vm/CMakeLists.txt:4 (wasmedge_add_library)


CMake Error at cmake/Helper.cmake:184 (add_library):
  Target "wasmedgeDriver" links to target "ZLIB::ZLIB" but the target was not
  found.  Perhaps a find_package() call is missing for an IMPORTED target, or
  an ALIAS target is missing?
Call Stack (most recent call first):
  lib/driver/CMakeLists.txt:16 (wasmedge_add_library)


CMake Error at cmake/Helper.cmake:184 (add_library):
  Target "wasmedge_shared" links to target "ZLIB::ZLIB" but the target was
  not found.  Perhaps a find_package() call is missing for an IMPORTED
  target, or an ALIAS target is missing?
Call Stack (most recent call first):
  lib/api/CMakeLists.txt:101 (wasmedge_add_library)


CMake Error at cmake/Helper.cmake:184 (add_library):
  Target "wasmedgeCAPI" links to target "ZLIB::ZLIB" but the target was not
  found.  Perhaps a find_package() call is missing for an IMPORTED target, or
  an ALIAS target is missing?
Call Stack (most recent call first):
  lib/api/CMakeLists.txt:75 (wasmedge_add_library)
```

WasmEdgeはzlibを使用するが、wasi-sdkのsysrootには存在しないのでビルドに失敗する。zlibをWasm向けにビルドしてあげればもしかしたらうまくいくかもしれない。

参考: [No zlib in WASI #93819 - python/cpython](https://github.com/python/cpython/issues/93819)
### 2.5 [Wasm3](https://github.com/wasm3/wasm3)
Wasm3は、高速で汎用的なWasmインタプリタ。Arduinoなどの組み込み・IoT環境で実行できることも謳っている。

```
cmake -DCMAKE_TOOLCHAIN_FILE="/home/chikuwait/wasm3/wasi-sdk-11.0/share/cmake/wasi-sdk.cmake" -DWASI_SDK_PREFIX="/home/chikuwait/wasm3/wasi-sdk-11.0" .. && make

...
[100%] Linking C executable wasm3.wasm
clang version 10.0.0 (https://github.com/llvm/llvm-project d32170dbd5b0d54436537b6b75beaf44324e0c28)
Target: wasm32-unknown-wasi
Thread model: posix
InstalledDir: /home/chikuwait/wasm3/wasi-sdk-11.0/bin
 "/home/chikuwait/wasm3/wasi-sdk-11.0/bin/wasm-ld" -L/home/chikuwait/wasm3/wasi-sdk-11.0/share/wasi-sysroot/lib/wasm32-wasi /home/chikuwait/wasm3/wasi-sdk-11.0/share/wasi-sysroot/lib/wasm32-wasi/crt1.o --no-threads -z stack-size=8388608 CMakeFiles/wasm3.wasm.dir/platforms/app/main.c.obj source/libm3.a -lc /home/chikuwait/wasm3/wasi-sdk-11.0/lib/clang/10.0.0/lib/wasi/libclang_rt.builtins-wasm32.a -o wasm3.wasm
[100%] Built target wasm3.wasm
```

Wasm3は、Readmeで```wasm3 can execute wasm3 (self-hosting)```と書かれているように、Wasmにコンパイルできることを公式にアピールしている。

# 3. Wasm3.wasm on Wasmランタイムのベンチマーク
wasm3がwasmにビルドできたので、wasm3.wasm on Wasmランタイム環境で簡単なベンチマークを実行して性能を計測してみた。

実験環境は、さくらの専用サーバPHY Fujitsu PRIMERGY RX2530 M5を使用した。
- Intel Silver 4208 2.1GHz (8コア)
- 32GB RAM
- Linux 5.15

ベンチマークには、[The Computer Language 24.06 Benchmarks Game](https://benchmarksgame-team.pages.debian.net/benchmarksgame/measurements/rust.html)にあるBinary-treeのRustコードを使用して、計算にかかる時間を測定した。N=7、14、21。


| Binary-tree | 7 | 14 | 21 |
| - | -: | -: | -: |
| Wasm3 (Interp.)  | 0.025s | 2.023s | 6m10.097s |
| Wasm3.wasm on Wasm3 | 0.349s | 1m5.761s | 200m51.784s |
| Wasmtime (JIT) | 0.450s | 0.622s | 32.909s |
| Wasm3.wasm on Wasmtime (JIT)  | 0.133s | 21.677s | 67m13.435s |
| WasmEdge (Interp.)  | 0.191s | 40.264s | 125m45.874s |
| WasmEdge (AOT) | 0.043s | 0.226s | 33.869s |
| Wasm3.wasm on WasmEdge (Interp.)  | 4.099s | 11m55.544s | 2203m10.506s |
| Wasm3.wasm on WasmEdge (AOT) | 0.219s | 55.496s | 173m24.420s |

実験結果は以下のテーブルの通り。
N=21のとき、入れ子しない場合と比べて、Wasm3.wasm on Wasm3は約32倍、Wasm3.wasm on Wasmtime (JIT) は約122倍、 Wasm3.wasm on WasmEdge (Interp.) は、約17倍、Wasm3.wasm on WasmEdge (AOT)は約307倍計算時間がかかった。

想像の通りかなり遅い。
WasmEdgeの結果を見ると、AOTコンパイルでインタプリタ程度には近づけることができるが、とはいえ遅い。
不思議なのは、WasmtimeでN=7の時だけ、Wasm3.wasm on Wasmtimeのほうが速かった。
これはJITコンパイルするホットスポットの違いなのだろうか？ちゃんとプロファイリングを取ってみないと分からない。
JITコンパイルのパフォーマンスは難しい。
ともかく、これだけ差があると、実用的なアプリケーションをランタイムonランタイムするのは中々難しいかもしれない（そんなユースケースはあるか？不明）。