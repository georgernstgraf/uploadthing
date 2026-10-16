#!/usr/local/bin/python3
import json
import re
import subprocess
import urllib.request


def send_ips_to_server(ips, url="http://192.168.21.1:8000/activeips"):
    """Send IPs to the server via POST request."""
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


def extract_ips(nmap_output):
    pattern = r"^Nmap scan report for (\d+\.\d+\.\d+\.\d+)$"
    return set(re.findall(pattern, nmap_output, flags=re.MULTILINE))


def scan_subnet(subnet="192.168.21.0/24"):
    result = subprocess.run(
        ["nmap", "-sn", "-PR", "-n", "--reason", subnet],
        capture_output=True,
        text=True,
        check=True,
    )
    found_ips = extract_ips(result.stdout)
    sorted_ips = sorted(found_ips, key=lambda ip: int(ip.split(".")[-1]))
    from datetime import datetime

    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S "), end="")
    if sorted_ips:
        print("API response: " + str(send_ips_to_server(sorted_ips)))
    else:
        print("no api call\n")


if __name__ == "__main__":
    scan_subnet()
