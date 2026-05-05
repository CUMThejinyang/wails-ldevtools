package apidebug

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type HttpMultipartItem struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Kind     string `json:"kind"`
	FilePath string `json:"filePath"`
}

type HttpRequestParams struct {
	Method         string              `json:"method"`
	Url            string              `json:"url"`
	Headers        map[string]string   `json:"headers"`
	Body           string              `json:"body"`
	MultipartItems []HttpMultipartItem `json:"multipartItems"`
}

type HttpResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Size       int64             `json:"size"`
	DurationMs int64             `json:"durationMs"`
}

func SendHttpRequest(params HttpRequestParams) (HttpResponse, error) {
	client := &http.Client{
		Timeout: 60 * time.Second,
	}

	var reqBody io.Reader
	if len(params.MultipartItems) > 0 {
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for _, item := range params.MultipartItems {
			if item.Kind == "file" {
				file, err := os.Open(item.FilePath)
				if err != nil {
					return HttpResponse{}, err
				}
				part, err := writer.CreateFormFile(item.Key, filepath.Base(item.FilePath))
				if err != nil {
					file.Close()
					return HttpResponse{}, err
				}
				if _, err = io.Copy(part, file); err != nil {
					file.Close()
					return HttpResponse{}, err
				}
				file.Close()
				continue
			}
			if err := writer.WriteField(item.Key, item.Value); err != nil {
				return HttpResponse{}, err
			}
		}
		if err := writer.Close(); err != nil {
			return HttpResponse{}, err
		}
		if params.Headers == nil {
			params.Headers = map[string]string{}
		}
		params.Headers["Content-Type"] = writer.FormDataContentType()
		reqBody = &buf
	} else if params.Body != "" {
		reqBody = strings.NewReader(params.Body)
	}

	req, err := http.NewRequest(params.Method, params.Url, reqBody)
	if err != nil {
		return HttpResponse{}, err
	}

	for k, v := range params.Headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := client.Do(req)
	duration := time.Since(start).Milliseconds()

	if err != nil {
		return HttpResponse{}, err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)

	responseHeaders := make(map[string]string, len(resp.Header))
	for k, v := range resp.Header {
		responseHeaders[k] = v[0]
	}

	return HttpResponse{
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Body:       string(bodyBytes),
		Headers:    responseHeaders,
		Size:       int64(len(bodyBytes)),
		DurationMs: duration,
	}, nil
}
