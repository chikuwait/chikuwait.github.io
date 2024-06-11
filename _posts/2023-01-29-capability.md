---
layout: post
title: WASI’s Capability-based Security Model
date : 29-01-2023
description:
tags: WebAssembly
categories:
giscus_comments: true
related_posts: true
pretty_table: true
---

## 1.Introduction
WebAssembly (Wasm) that binary instruction and virtual machine format is known as safe by the sandboxed execution environment. 
The characteristic achieved by Wasm modules operates isolated simple linear memory and performs various checks and verifications for these operations. 
Since Wasm has APIs that interact outside of sandboxes such as web browsers or host OS environments, the safety of these APIs is important for wasm sandboxes.

WebAssembly System Interface (WASI) is the API for interacting wasm sandboxes with OS resources such as OS processes and filesystems. 
If wasm sandboxes can access OS resources loose via its API, a malicious wasm module can modify OS resources without permission. 
To prevent these cases, WASI implements a Capability-based security mechanism. 
In this article, I introduce the capability-based OS security model and how wasm runtime achieved the security model.

## 2.WASI
WASI is an API family for accessing OS resources such as files to execute Wasm in non-web environments. 
It defines system-call functions similar to POSIX, but it is custom-tailored to Wasm use cases such as not being able to use fork() or exec().

It consists of two parts as shown in the figure 1: an interface called WASI libc and implementation of WASI prepared for each architecture and environment.
WASI libc is achieved by a wrapper layer of system-calls that invoke the implementation of WASI and an interface based on musl libc.
WASI libc can be specified as sysroot which indicates to compilers the header and root directory of libraries.

![the architecture of WASI](https://github.com/bytecodealliance/wasmtime/raw/main/docs/wasi-software-architecture.png)

Fig.1 [WASI: WebAssembly System Interface](https://github.com/bytecodealliance/wasmtime/blob/main/docs/WASI-overview.md)

## 3.Capability-based Security Model
Capability-based security is based on the principle of least privilege (JEROME H. SALTZER and MICHAEL D. SCHROEDER, 1975) and grants access rights to an OS process only to the information and computational resources it needs for its legitimate purposes. 
The object describing access privileges is called Capability(Jack B. Dennis and Earl C. Van Horn, 1966), which is a pair of resources and rights. 
Linux has a security mechanism called Linux Capability, but it is a division of privileges and is different from Capability in Capability-based security.

Many commercial OSes such as Linux and BSD*, implement a security model ACL(Access Control List) instead of Capability. 
In ACL, when processes access OS resources, the OS grants access privileges based on the process's user information. 
In contrast, an OS of capability-based security grants an unforgeable capability to a process in advance, and the process access OS resource using it.
If capabilities are granted, there is correct access, so verification processes at the time of access are not required. The difference between ACL and capability is shown in the figure.

![capability](/assets/img/blog/2023-01-29-acl-capability.png) 

Fig.2 ACL vs Capability


## 4.Capability-based Security of WASI
Now let's check the capability's behavior using Wasmtime, a Wasm runtime with WASI support.
Use the sample code that reads files.

```c
#include <stdlib.h>
#include <fcntl.h>
#include <stdio.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv){
    char buf[100];
    int size;
    int fd = open(argv[1],O_RDONLY);
    if (fd_in < 0){
        fprintf(stderr,"Error Opening Input: %s",strerror(errno));
        exit(1);
    }

    while(1){
        size = read(fd,buf,sizeof(buf));
				if (size < 0){
            fprintf(stderr,"Read error: %s",strerror(errno));
            exit(1)
        }
        if(size == 0) break;
        printf("%s",buf);
    }
    close(fd);
    return EXIT_SUCCESS;
}
```

```
$ cat sample_text
Hello world!
```

Compile the sample code using clang. 
```
$ clang --sysroot=./wasi-sdk/share/wasi-sysroot/ read_sample.c -o read_sample.wasm
```

When we execute its compiled code, we receive an error of capabilities insufficient. 
This is due to wasm module is not granted a capability that open sample_text. 
Wasmtime can grant capability using the ```--dir``` option that opens files in a directory.
```
$ wasmtime　read_sample.wasm sample_text
Error Opening Input: No such file or directory

$ wasmtime --dir=. read_sample.wasm sample_text
Hello world!
```

Next, we attempt to escape from a Wasm sandbox.
We grant a capability that opens ```/tmp``` directory.
Then, we use ```..``` to move up to a higher-level directory for escaping a sandbox.
However, its operation failed due to we don't grant capabilities that open without ```/tmp```.
Great!
```
$ wasmtime --dir=/tmp read_sample.wasm /tmp/../sample_text
Error Opening Input: Operation not permitted
```

The sample code is general, we don't need to the programming of capabilities aware. 
This is due to WASI achieving capability-based security on ACL-based OS by transparently applying capability against API calls called by wasm modules. 
Each capability is associated internally with a file descriptor to transparently apply it. 
It is similar to the approach of transparently applying Capsicum that enables Capability-based Security on FreeBSD, which uses ACLs (Jonathan Anderson, Stanley Godfrey, and Robert N M Watson,2017) and the approach that applies it at compile time, called CloudABI.

We take the open() system-call as a theme and explain how WASI achieved transparently implementation of Capability-based security.
To achieve this, WASI-libc utilizes the libpreopen library, which can store and refer to preopend file descriptors.
The normal open() such as libc and WASI-libc's open() are not different in the application interface because WASI-libc uses musl libc for the top-half layer, which is the interface to applications.
Instead, it uses libpreopen for the bottom-half layer,  which defines interfaces for the implementation of the WASI system-calls layer.
From here, we dive into the bottom-half layer of the open().

Like libc, WASI-libc converts open() to openat().
However, it seems to use file descriptors of relative paths obtained by find_relpath instead of path* of open().
If it can not obtain file descriptors, it indicates that the relative paths to the pre-opened directory could not be found.
In order words, the capability regarding the directory to open does not exist.
In addition, __wasilibc_nocwd_openat_nomode calculates the rights of the capability according to the open()'s access mode, opens and returns a file descriptor.
```c
// https://github.com/WebAssembly/wasi-libc/blob/b4814997f61ee352d8c1ae397561a813fb30c701/libc-bottom-half/sources/posix.c#L50
int open(const char *path, int oflag, ...) {
    // WASI libc's `openat` ignores the mode argument, so call a special
    // entrypoint which avoids the varargs calling convention.
    return __wasilibc_open_nomode(path, oflag);
}

// See the documentation in libc.h
int __wasilibc_open_nomode(const char *path, int oflag) {
    char *relative_path;
    int dirfd = find_relpath(path, &relative_path);

    // If we can't find a preopen for it, fail as if we can't find the path.
    if (dirfd == -1) {
        errno = ENOENT;
        return -1;
    }

    return __wasilibc_nocwd_openat_nomode(dirfd, relative_path, oflag);
}
```

```c
// https://github.com/WebAssembly/wasi-libc/blob/099caae3eb9111a67d2f0e1b4f9f5f98e682482a/libc-bottom-half/cloudlibc/src/libc/fcntl/openat.c#L23
int __wasilibc_nocwd_openat_nomode(int fd, const char *path, int oflag) {
...
  __wasi_rights_t max =
      ~(__WASI_RIGHTS_FD_DATASYNC | __WASI_RIGHTS_FD_READ |
        __WASI_RIGHTS_FD_WRITE | __WASI_RIGHTS_FD_ALLOCATE |
        __WASI_RIGHTS_FD_READDIR | __WASI_RIGHTS_FD_FILESTAT_SET_SIZE);
  switch (oflag & O_ACCMODE) {
    case O_RDONLY:
    case O_RDWR:
    case O_WRONLY:
      if ((oflag & O_RDONLY) != 0) {
        max |= __WASI_RIGHTS_FD_READ | __WASI_RIGHTS_FD_READDIR;
      }
      if ((oflag & O_WRONLY) != 0) {
        max |= __WASI_RIGHTS_FD_DATASYNC | __WASI_RIGHTS_FD_WRITE |
               __WASI_RIGHTS_FD_ALLOCATE |
               __WASI_RIGHTS_FD_FILESTAT_SET_SIZE;
      }
      break;
    case O_EXEC:
      break;
    case O_SEARCH:
      break;
    default:
      errno = EINVAL;
      return -1;
  }

...

  // Open file with appropriate rights.
  __wasi_fdflags_t fs_flags = oflag & 0xfff;
  __wasi_rights_t fs_rights_base = max & fsb_cur.fs_rights_inheriting;
  __wasi_rights_t fs_rights_inheriting = fsb_cur.fs_rights_inheriting;
  __wasi_fd_t newfd;
  error = __wasi_path_open(fd, lookup_flags, path,
                                 (oflag >> 12) & 0xfff,
                                 fs_rights_base, fs_rights_inheriting, fs_flags,
                                 &newfd);
  if (error != 0) {
    errno = error;
    return -1;
  
  return newfd;
}
```

So we can see that it is inside find_relpath that libpreopen is being utilized. 
find_relpath is a helper to __wasilibc_find_relpath. __wasilibc_find_relpath further calls __wasilibc_find_abspath, which searches the preopens table and returns the file descriptor of the directory if that path is in the table, otherwise returns ENOENT to indicate that there is no capability to open it.

```c
// https://github.com/WebAssembly/wasi-libc/blob/a02298043ff551ce1157bc2ee7ab74c3bffe7144/libc-bottom-half/sources/preopens.c#L159
int __wasilibc_find_relpath(const char *path,
                            const char **abs_prefix,
                            char **relative_path,
                            size_t relative_path_len) {
  ...
    if (__wasilibc_find_relpath_alloc)
        return __wasilibc_find_relpath_alloc(path, abs_prefix, relative_path, &relative_path_len, 0);
    return __wasilibc_find_abspath(path, abs_prefix, (const char**) relative_path);
}
```

```c
// https://github.com/WebAssembly/wasi-libc/blob/a02298043ff551ce1157bc2ee7ab74c3bffe7144/libc-bottom-half/sources/preopens.c#L172
int __wasilibc_find_abspath(const char *path,
                            const char **abs_prefix,
                            const char **relative_path) {
    // Strip leading `/` characters, the prefixes we're mataching won't have
    // them.
    while (*path == '/')
        path++;
    // Search through the preopens table. Iterate in reverse so that more
    // recently added preopens take precedence over less recently addded ones.
    size_t match_len = 0;
    int fd = -1;
    LOCK(lock);
    for (size_t i = num_preopens; i > 0; --i) {
        const preopen *pre = &preopens[i - 1];
        const char *prefix = pre->prefix;
        size_t len = strlen(prefix);

        // If we haven't had a match yet, or the candidate path is longer than
        // our current best match's path, and the candidate path is a prefix of
        // the requested path, take that as the new best path.
        if ((fd == -1 || len > match_len) &&
            prefix_matches(prefix, len, path))
        {
            fd = pre->fd;
            match_len = len;
            *abs_prefix = prefix;
        }
    }
    UNLOCK(lock);

    if (fd == -1) {
        errno = ENOENT;
        return -1;
    }
```

Previously, it returned ENOTCAPABLE but was changed to ENOENT to improve portability by applying capability transparently to the application.

[Use ENOENT rather than ENOTCAPABLE for missing preopens. #370](https://github.com/WebAssembly/wasi-libc/pull/370)

## 5.Conclusion
WASI uses the concept of Capability-based Security to prevent escape from the sandbox by granting minimum privileges to applications. 
It also enforces it with a layer of standard C libraries on the OS using ACLs, thereby achieving transparent Capability-based Security that does not require modification of the application. 
The transparent implementation utilizes libpreopen, which can store and reference file descriptors of pre-opened directories in a layer of standard C libraries.