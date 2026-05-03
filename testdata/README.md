# Explorer Testdata

This directory exercises all renderer categories.

## Features

- [x] Markdown rendering with **bold**, *italic*, and ~~strikethrough~~
- [x] GFM tables
- [x] Fenced code blocks

### Table example

| Name      | Type   | Notes      |
|-----------|--------|------------|
| README.md | text   | this file  |
| notes.txt | text   | plain text |
| logo.png  | image  | tiny PNG   |

### Code block

```go
package main

import "fmt"

func main() {
    fmt.Println("hello, explorer!")
}
```

### Relative image

![Logo](./images/logo.png)

### Relative link

See [notes](./notes.txt) for more.
