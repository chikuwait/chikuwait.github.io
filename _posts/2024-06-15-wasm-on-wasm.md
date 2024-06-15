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
### 2.1 Wasmtime