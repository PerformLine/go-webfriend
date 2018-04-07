package browser

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/ghetzel/go-stockutil/log"
	"github.com/ghetzel/go-stockutil/maputil"
	"github.com/ghetzel/go-stockutil/stringutil"
	"github.com/gobwas/glob"
	"github.com/mafredri/cdp/rpcc"
)

type EventCallbackFunc func(event *Event)

type eventWaiter struct {
	ID      string
	Pattern glob.Glob
	Events  chan *Event
}

func newEventWaiter(eventGlob string) (*eventWaiter, error) {
	if pattern, err := glob.Compile(eventGlob); err == nil {
		return &eventWaiter{
			ID:      stringutil.UUID().String(),
			Pattern: pattern,
			Events:  make(chan *Event),
		}, nil
	} else {
		return nil, err
	}
}

func (self *eventWaiter) Match(event *Event) bool {
	return self.Pattern.Match(event.Name)
}

type Event struct {
	ID        int
	Name      string
	Result    *maputil.Map
	Params    *maputil.Map
	Error     error
	Timestamp time.Time
}

func (self *Event) String() string {
	if self.Error != nil {
		return self.Error.Error()
	} else {
		return self.Name
	}
}

func eventFromRpcResponse(resp *rpcc.Response) (*Event, error) {
	event := &Event{
		ID:        int(resp.ID),
		Name:      resp.Method,
		Result:    maputil.M(nil),
		Params:    maputil.M(nil),
		Timestamp: time.Now(),
	}

	// an empty result will be the literal "{}", so len>2 means there's actual data in there
	if len(resp.Result) > 2 {
		m := make(map[string]interface{})

		if err := json.Unmarshal(resp.Result, &m); err == nil {
			event.Result = maputil.M(m)
		} else {
			return nil, err
		}
	}

	if len(resp.Args) > 0 {
		m := make(map[string]interface{})

		if err := json.Unmarshal(resp.Args, &m); err == nil {
			event.Params = maputil.M(m)
		} else {
			return nil, err
		}
	}

	if resp.Error != nil {
		event.Error = fmt.Errorf(
			"Error %d: %v",
			resp.Error.Code,
			resp.Error.Message,
		)
	}

	return event, nil
}

type rpccStreamIntercept struct {
	conn   io.ReadWriter
	events chan *Event
}

func newRpccStreamIntercept(conn io.ReadWriter, events chan *Event) *rpccStreamIntercept {
	return &rpccStreamIntercept{
		conn:   conn,
		events: events,
	}
}

func (self *rpccStreamIntercept) WriteRequest(req *rpcc.Request) error {
	var buf bytes.Buffer

	if err := json.NewEncoder(&buf).Encode(req); err != nil {
		return err
	}

	if _, err := self.conn.Write(buf.Bytes()); err != nil {
		return err
	}

	// log.Debugf("[proto] WROTE: %v", buf.String())

	return nil
}

func (self *rpccStreamIntercept) ReadResponse(resp *rpcc.Response) error {
	var buf bytes.Buffer

	if err := json.NewDecoder(io.TeeReader(self.conn, &buf)).Decode(resp); err != nil {
		return err
	}

	// log.Debugf("[proto] READ: %v", buf.String())

	if event, err := eventFromRpcResponse(resp); err == nil {
		self.events <- event
	} else {
		log.Warningf("event error: %v", err)
	}

	return nil
}
