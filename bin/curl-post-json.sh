#!/bin/bash

# Token please only use ephemeral keys here!!
token="clusternator-project-the-clusternator:T7JB2zELNmbCc1nTtRhBUQluDsEvwZN7bwLZUGrk7bhYozv5ThJHrZ1oXC0qpuxpjdDGg22rp8-Jl80Dou_KiA"
hmacDigest='sha1=33d0abb1cd72fada343b668e561c5fff9680c3c7'

# Data blobs
data='{"test":"data"}'
#data='{"id":"sideboard","pr":"255"}'
#data='{"username":"pat","authority":1,"password":"testtesttest"}'
#version="-alpha"

# Url to try
#url="http://192.168.99.100:9090/0.1/project/create"
url="http://127.0.0.1:9090/0.1/github/pr"

# Clusternator Auth Style
#curl -H "Content-Type: application/json"\
#     -H "Authorization: Token ${token}"\
#     -X POST -d $data $url

# Mock GitHub
curl -H "Content-Type: application/json"\
     -H "x-github-event: push"\
     -H "x-github-delivery: 0162e080-dfb5-11e5-8951-86a974644a75"\
     -H "x-hub-signature: $hmacDigest"\
     -X POST -d $data $url
