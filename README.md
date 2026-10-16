# EXAMDNS Installation Notes

This repository collects OPNsense and FreeBSD helper scripts, service files,
and configuration snippets used for a DNS-focused appliance setup.

## Repository layout

- `bin/` contains scripts intended for `/root/bin` or a similar PATH location.
- `files/` mirrors target appliance paths under `/usr/local/...`.
- `Mikrotik/` stores router config artifacts and command notes.

## Install into `/root`

- Clone or unpack this repository as `root` into `/root/examdns`.
- Make the scripts available on PATH, for example with `ln -s /root/examdns/bin /root/bin`.

## OPNsense base DNS settings

### System -> Settings -> General

- Leave `DNS Servers` empty, or configure them explicitly if your environment requires it.
- Enable `Allow DNS server list to be overridden by DHCP/PPP on WAN`.
- Enable `Do not use the local DNS service as a nameserver for this system`.

### Services -> Unbound DNS -> Query Forwarding

- Enable `Use System Nameservers`.

### Services -> Unbound DNS -> Advanced

- Enable `Log Queries`.
- Enable `Log Replies`.
- Enable `Tag Queries and Replies`.

## Redirect DNS traffic to Unbound

### Firewall -> NAT -> Port Forward

- Redirect all DNS traffic targeting `not this firewall:53` to `127.0.0.1:53`.

## Block known DoH endpoints

### Firewall -> Aliases -> Add

- Set `Type` to `URL Table (IPs)`.
- Use `<https://raw.githubusercontent.com/crypt0rr/public-doh-servers/main/ipv4.list>` as the source.

### Firewall -> Rules -> LAN

- Add a rule rejecting port `443` traffic to the DoH alias.

## Scan helper / configd integration

The repository includes scan helpers and configd wiring used on OPNsense:

- `bin/scan-pfctl.py` posts active IPs discovered from `pfctl -ss`.
- `files/usr_local_opnsense_scripts_custom_nmap_cron.sh` is the cron wrapper.
- `files/usr_local_opnsense_service_conf_actions.d_actions_exampy.conf` defines the configd action.

Deployment steps:

- Install `files/usr_local_opnsense_scripts_custom_nmap_cron.sh` as `/usr/local/opnsense/scripts/custom/nmap_cron.sh`.
- Install `files/usr_local_opnsense_service_conf_actions.d_actions_exampy.conf` into `/usr/local/opnsense/service/conf/actions.d/`.
- Restart configd with `service configd restart`.
- Create the cron job in the OPNsense GUI.

## Host overrides

Common host overrides referenced in this setup:

- `router`
- `sense`
- `tplink`

## Uploadthing service

The rc.d service file is stored at `files/usr_local_etc_rc.d_uploadthing`.

- Create `33.2/32` as a Proxy ARP address.
- Add a firewall NAT port-forward from `33.2:80` to `localhost:8000`.
- Start the service with `service uploadthing start` after deployment.

## Admin access

### System -> Admin -> Settings

- Enable SSH and root login if that matches your appliance policy.
- Enable passwordless sudo only if your environment allows it.
- Enable the serial console when needed for recovery access.

## Optional USB NIC persistence

- Install `files/usr_local_sbin_usb_nic_rename.sh` as `/usr/local/sbin/usb_nic_rename.sh` and mark it executable.
- Install `files/usr_local_etc_devd_usb_persist.conf` as `/usr/local/etc/devd/usb_persist.conf`.
- Adjust the placeholder MAC addresses in `/usr/local/sbin/usb_nic_rename.sh` before use.

## Useful shell aliases

- `alias ub='unbound-control -c /var/unbound/unbound.conf'`
- `alias ut='tail -F /var/log/resolver/latest.log'`

## System tunables

### Disable blackhole behavior

- `net.inet.tcp.blackhole=0`
- `net.inet.udp.blackhole=0`

### Keep the USB bus awake

- `hw.usb.no_suspend=1`

## Notes

- Additional operational guidance now lives in `README.md` and `AGENTS.md` only; `technical_notes.md` is no longer used.
- Review MikroTik exports before committing them; `show-sensitive` exports can include live secrets.
