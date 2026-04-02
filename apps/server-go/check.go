package main

import (
	"fmt"
	"github.com/anacrolix/torrent"
)

func main() {
	c := torrent.NewDefaultClientConfig()
	c.Seed = true
	fmt.Println(c.Seed)
}
