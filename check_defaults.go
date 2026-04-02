package main
import (
    "fmt"
    "github.com/anacrolix/torrent"
)
func main() {
    cfg := torrent.NewDefaultClientConfig()
    fmt.Printf("NoUpload: %v\n", cfg.NoUpload)
    fmt.Printf("Seed: %v\n", cfg.Seed)
}
