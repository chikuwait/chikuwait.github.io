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
Wasmは、あらゆる言語で記述されたプログラムをWasmにコンパイルすることで、Wasmランタイムが動作する計算機であればどこでもプログラムが実行できるるポータブルな環境である。
JavaのWrite Once, Run Anywhereみたいなことをあらゆる言語で実現できる。
WasmランタイムはWasmtimeやWasmer, WasmEdgeなどクラウドや組み込み、エッジ環境などに合わせた多様な実装がある。
ある日ふと、WasmランタイムをWasmにコンパイルして別のWasmランタイムで実行できるんだろうか？と気になったので試してみた。

## 2. WasmランタイムをWasmビルドしてみる
### 2.1 [Wasmtime](https://github.com/bytecodealliance/wasmtime)
WasmとWASIの実質的なリファレンス実装。

### 2.2 [Wasmi](https://github.com/wasmi-labs/wasmi)
インタプリタ方式を採用したWasmランタイム。軽量で組み込み・IoT環境での使用を意識している。

### 2.3 [Wasmer](https://github.com/wasmerio/wasmer)
ラップトップ(Win/Mac/)から、クラウド、エッジなどあらゆる環境でWasmを実行するためのランタイム。WASIを拡張してPOSIXの多様な機能に対応するオリジナルなインターフェースであるWASIXをサポートしている。

### 2.4 [WasmEdge](https://github.com/WasmEdge/WasmEdge)

### 2.5 [Wasm3](https://github.com/wasm3/wasm3)
