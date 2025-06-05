package easy

import (
	"crypto/sha256"
	"encoding/base64"
	"math/rand"
	"regexp"
	"time"
)

type Message struct {
	Code int    `json:"code"`
	Text string `json:"text"`
	Tag  string `json:"tag"`
	Time string `json:"time"`
}

const MinCIDlen int = 5
const MaxCIDlen int = 10

const MinUIDlen int = 3
const MaxUIDlen int = 5

var GenerateCIDlen = 5

const MaxTransmitSizeInBytes = 10485760

const TimeLayout = "2006-01-02T15:04:05.999-0700"

var MyRunes = []rune("abcdefghijklmnopqrstuvwxyz0123456789")

var IsLetter = regexp.MustCompile(`^[a-z0-9]+$`).MatchString

func MakeRandString(l int) string {
	rand.Seed(time.Now().UnixNano())
	b := make([]rune, l)
	for i := range b {
		b[i] = MyRunes[rand.Intn(len(MyRunes))]
	}
	return string(b)
}

func GetHash(in []byte) string {
	hasher := sha256.New()
	hasher.Write(in)
	sha := base64.URLEncoding.EncodeToString(hasher.Sum(nil))
	return sha
}
