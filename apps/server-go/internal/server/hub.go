package server

import (
	"sync"

	"github.com/gofiber/websocket/v2"
)

// client represents a single active WebSocket connection.
type client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	focusHash string
	mu        sync.Mutex
}

func (c *client) setFocus(hash string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.focusHash = hash
}

func (c *client) getFocus() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.focusHash
}

// writePump pumps messages from the hub to the websocket connection.
func (c *client) writePump() {
	defer func() {
		_ = c.conn.Close()
	}()

	for {
		message, ok := <-c.send
		if !ok {
			return
		}
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

// Hub maintains the set of active clients and broadcasts messages to them.
type Hub struct {
	clients    map[*client]bool
	register   chan *client
	unregister chan *client
	mu         sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		register:   make(chan *client),
		unregister: make(chan *client),
		clients:    make(map[*client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()
		}
	}
}

// CustomBroadcast allows sending tailored messages to each client based on their focus.
func (h *Hub) ForEach(fn func(*client)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		fn(c)
	}
}

func (h *Hub) Broadcast(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		select {
		case c.send <- message:
		default:
			delete(h.clients, c)
			close(c.send)
		}
	}
}
