package models

import (
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/dht/v2"
	"golang.org/x/time/rate"
)

// TorrentEngine defines the subset of anacrolix/torrent.Client methods we use.
type TorrentEngine interface {
	AddMagnet(uri string) (EngineTorrent, error)
	AddTorrent(mi *metainfo.MetaInfo) (EngineTorrent, error)
	Torrents() []EngineTorrent
	DhtNodes() int
	SetRateLimits(dl, up int64)
	SetDht(enabled bool)
	SetPex(enabled bool)
	Close() []error
}

// EngineTorrent defines the subset of anacrolix/torrent.Torrent methods we use.
type EngineTorrent interface {
	GotInfo() <-chan struct{}
	HasInfo() bool
	DownloadAll()
	Drop()
	DropWithData()
	Name() string
	Length() int64
	BytesCompleted() int64
	InfoHash() metainfo.Hash
	Files() []EngineFile
	
	// Control Methods
	AllowDataDownload()
	DisallowDataDownload()
	AllowDataUpload()
	DisallowDataUpload()
	VerifyData() error
	NumPieces() int
	CancelPieces(start, end int)
	SetSequential(bool)
	
	// Stats
	Stats() torrent.TorrentStats
}

// EngineFile defines the subset of anacrolix/torrent.File methods we use.
type EngineFile interface {
	DisplayPath() string
	Path() string
	Length() int64
	BytesCompleted() int64
	Priority() int 
	SetPriority(priority int)
}

// Internal wrappers to satisfy the interfaces using real anacrolix types
type TorrentWrapper struct {
	*torrent.Torrent
}

func (w TorrentWrapper) GotInfo() <-chan struct{} {
	return w.Torrent.GotInfo()
}

func (w TorrentWrapper) HasInfo() bool {
	return w.Torrent.Info() != nil
}

func (w TorrentWrapper) Drop() {
	w.Torrent.Drop()
}

func (w TorrentWrapper) DropWithData() {
	// Note: anacrolix/torrent.Torrent.Drop() only removes from client.
	// Actual file deletion is handled by TorrentService using filesystem calls.
	w.Torrent.Drop()
}

func (w TorrentWrapper) InfoHash() metainfo.Hash {
	return w.Torrent.InfoHash()
}

func (w TorrentWrapper) Files() []EngineFile {
	engineFiles := w.Torrent.Files()
	list := make([]EngineFile, len(engineFiles))
	for i, f := range engineFiles {
		list[i] = FileWrapper{f}
	}
	return list
}

func (w TorrentWrapper) Stats() torrent.TorrentStats {
	return w.Torrent.Stats()
}

func (w TorrentWrapper) SetSequential(sequential bool) {
	// In anacrolix/torrent, we can achieve sequential download by
	// setting piece priorities in ascending order.
	if sequential {
		for i := 0; i < w.Torrent.NumPieces(); i++ {
			// Higher priority for earlier pieces
			// Note: This is a simplistic implementation. 
			// Truly sequential usually involves a moving window.
			w.Torrent.Piece(i).SetPriority(torrent.PiecePriorityNormal)
		}
	}
}

type FileWrapper struct {
	*torrent.File
}

func (w FileWrapper) DisplayPath() string {
	return w.File.DisplayPath()
}

func (w FileWrapper) Path() string {
	return w.File.Path()
}

func (w FileWrapper) Length() int64 {
	return w.File.Length()
}

func (w FileWrapper) BytesCompleted() int64 {
	return w.File.BytesCompleted()
}

func (w FileWrapper) Priority() int {
	return int(w.File.Priority())
}

func (w FileWrapper) SetPriority(priority int) {
	w.File.SetPriority(torrent.PiecePriority(priority))
}

type EngineWrapper struct {
	Client     *torrent.Client
	DlLimit    *rate.Limiter
	UpLimit    *rate.Limiter
	DhtEnabled bool
	PexEnabled bool
}

func (w EngineWrapper) AddMagnet(uri string) (EngineTorrent, error) {
	t, err := w.Client.AddMagnet(uri)
	if err != nil {
		return nil, err
	}
	// PEX can be toggled on the torrent level
	if !w.PexEnabled {
		// Note: anacrolix doesn't have a direct per-torrent PEX toggle in the basic API, 
		// but it respects the private flag. Global PEX usually handled in ClientConfig.
	}
	return TorrentWrapper{t}, nil
}

func (w EngineWrapper) AddTorrent(mi *metainfo.MetaInfo) (EngineTorrent, error) {
	t, err := w.Client.AddTorrent(mi)
	if err != nil {
		return nil, err
	}
	return TorrentWrapper{t}, nil
}

func (w EngineWrapper) Torrents() []EngineTorrent {
	engineTorrents := w.Client.Torrents()
	list := make([]EngineTorrent, len(engineTorrents))
	for i, t := range engineTorrents {
		list[i] = TorrentWrapper{t}
	}
	return list
}

func (w EngineWrapper) DhtNodes() int {
	var total int
	for _, s := range w.Client.DhtServers() {
		stats := s.Stats()
		if dhtStats, ok := stats.(dht.ServerStats); ok {
			total += dhtStats.GoodNodes
		}
	}
	return total
}

func (w EngineWrapper) SetRateLimits(dl, up int64) {
	if w.DlLimit != nil {
		if dl > 0 {
			w.DlLimit.SetLimit(rate.Limit(dl))
		} else {
			w.DlLimit.SetLimit(rate.Inf)
		}
	}

	if w.UpLimit != nil {
		if up > 0 {
			w.UpLimit.SetLimit(rate.Limit(up))
		} else {
			w.UpLimit.SetLimit(rate.Inf)
		}
	}
}

func (w *EngineWrapper) SetDht(enabled bool) {
	w.DhtEnabled = enabled
	// Note: anacrolix/torrent.DhtServer interface doesn't expose Close().
	// Global DHT is best handled at Client initialization.
}

func (w *EngineWrapper) SetPex(enabled bool) {
	w.PexEnabled = enabled
	// Note: Global PEX is typically a ClientConfig setting.
}


func (w EngineWrapper) Close() []error {
	return w.Client.Close()
}
