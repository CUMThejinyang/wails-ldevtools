package apidebug

import "encoding/json"

type ApiGlobalConfig struct {
	GlobalHeaders []KvPair        `json:"globalHeaders"`
	Environments  []ApiEnv        `json:"environments"`
	ActiveEnvId   string          `json:"activeEnvId"`
	Collections   []ApiCollection `json:"collections"`
	HistoryLimit  int             `json:"historyLimit"`
}

type KvPair struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description,omitempty"`
}

type ApiEnv struct {
	Id        string   `json:"id"`
	Name      string   `json:"name"`
	Variables []KvPair `json:"variables"`
	Headers   []KvPair `json:"headers"`
}

type ApiCollection struct {
	Id       string             `json:"id"`
	Name     string             `json:"name"`
	Children []json.RawMessage  `json:"children"`
	Headers  []KvPair          `json:"headers"`
}

func DefaultConfig() ApiGlobalConfig {
	return ApiGlobalConfig{
		GlobalHeaders: []KvPair{},
		Environments:  []ApiEnv{},
		ActiveEnvId:   "",
		Collections:   []ApiCollection{},
		HistoryLimit:  100,
	}
}
