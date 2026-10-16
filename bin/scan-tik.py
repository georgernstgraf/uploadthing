#!/usr/local/bin/python3
import json
from datetime import datetime

import requests
import urllib.request
from requests.auth import HTTPBasicAuth


MIKROTIK_IP = "tik.internal"
USER = "service-monitor"
PASS = "m.aro17f"
API_URL = "http://192.168.21.1:8000/activeips"
REGISTRATION_TABLE_URL = (
    f"http://{MIKROTIK_IP}/rest/interface/wireless/registration-table"
)
REGISTRATION_TABLE_PARAMS = {
    ".proplist": "last-ip,mac-address,signal-strength,uptime,interface"
}


def send_ips_to_server(ips, url=API_URL):
    data = {"ips": ips}
    json_data = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=json_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    response = urllib.request.urlopen(req)
    result = response.read().decode("utf-8")
    return json.loads(result)


def fetch_wireless_clients():
    response = requests.get(
        REGISTRATION_TABLE_URL,
        auth=HTTPBasicAuth(USER, PASS),
        params=REGISTRATION_TABLE_PARAMS,
        timeout=5,
    )
    response.raise_for_status()
    return response.json()


def extract_sorted_ips(clients):
    found_ips = {
        client["last-ip"]
        for client in clients
        if client.get("last-ip") and client["last-ip"].count(".") == 3
    }
    return sorted(found_ips, key=lambda ip: tuple(int(part) for part in ip.split(".")))


def print_clients(clients):
    for client in clients:
        print(
            "IP: {ip} | MAC: {mac} | Signal: {signal} | Up: {uptime}".format(
                ip=client.get("last-ip", "-"),
                mac=client.get("mac-address", "-"),
                signal=client.get("signal-strength", "-"),
                uptime=client.get("uptime", "-"),
            )
        )


def scan_tik():
    clients = fetch_wireless_clients()
    sorted_ips = extract_sorted_ips(clients)

    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S "), end="")
    if sorted_ips:
        print(
            "API response: {response} | clients: {count}".format(
                response=send_ips_to_server(sorted_ips),
                count=len(sorted_ips),
            )
        )
    else:
        print("no api call | clients: 0")


if __name__ == "__main__":
    try:
        scan_tik()
    except requests.exceptions.RequestException as err:
        print(f"Verbindungsfehler: {err}")
