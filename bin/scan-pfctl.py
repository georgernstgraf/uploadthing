#!/usr/local/bin/python3
import subprocess
import re
import urllib.request
import json

def send_ips_to_server(ips, url="http://192.168.21.1:8000/activeips"):
    """Send IPs to the server via POST request"""
    data = {"ips": ips}
    json_data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=json_data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    response =  urllib.request.urlopen(req)
    result = response.read().decode('utf-8')
    return json.loads(result)

def get_active_ips(subnet_prefix="192.168.21."):
    result = subprocess.run(
        ["pfctl", "-ss"],
        capture_output=True,
        text=True,
        check=True
    )
    pattern = rf"{re.escape(subnet_prefix)}\d{{1,3}}"
    found_ips = set(re.findall(pattern, result.stdout))
    sorted_ips = sorted(found_ips, key=lambda ip: int(ip.split(".")[-1]))
    # print a date in the form "2024-06-15 14:30:00"
    from datetime import datetime
    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S "), end="")
    if sorted_ips:
        print ("API response: " + str(send_ips_to_server(sorted_ips)))
    else:
        print("no api call\n")

if __name__ == "__main__":
    get_active_ips()
