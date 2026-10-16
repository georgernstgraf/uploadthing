# 2026-01-10 09:25:36 by RouterOS 7.20.6
# software id = EQWY-7Y87
#
# model = RB951Ui-2HnD
# serial number = HJ70A3QF7RA
/interface bridge
add admin-mac=F4:1E:57:D9:60:89 auto-mac=no comment=defconf name=bridge \
    port-cost-mode=short
/interface wireless
set [ find default-name=wlan1 ] adaptive-noise-immunity=ap-and-client-mode \
    band=2ghz-g/n default-forwarding=no disabled=no distance=indoors \
    frequency=2437 installation=indoor mode=ap-bridge ssid=GRAFG \
    wireless-protocol=802.11
/interface list
add comment=defconf name=WAN
add comment=defconf name=LAN
/interface lte apn
set [ find default=yes ] ip-type=ipv4 use-network-apn=no
/interface wireless security-profiles
set [ find default=yes ] authentication-types=wpa2-psk comment=defconf \
    disable-pmkid=yes supplicant-identity=MikroTik wpa2-pre-shared-key=\
    6AWVC6DQ99
/interface bridge port
add bridge=bridge comment=defconf ingress-filtering=no interface=ether2 \
    internal-path-cost=10 path-cost=10
add bridge=bridge comment=defconf ingress-filtering=no interface=ether3 \
    internal-path-cost=10 path-cost=10
add bridge=bridge comment=defconf ingress-filtering=no interface=ether4 \
    internal-path-cost=10 path-cost=10
add bridge=bridge comment=defconf ingress-filtering=no interface=ether5 \
    internal-path-cost=10 path-cost=10
add bridge=bridge comment=defconf ingress-filtering=no interface=wlan1 \
    internal-path-cost=10 path-cost=10
add bridge=bridge ingress-filtering=no interface=ether1 internal-path-cost=10 \
    path-cost=10
/ip firewall connection tracking
set udp-timeout=10s
/ip neighbor discovery-settings
set discover-interface-list=LAN
/ip settings
set max-neighbor-entries=8192
/ipv6 settings
set disable-ipv6=yes max-neighbor-entries=8192
/interface list member
add comment=defconf interface=bridge list=LAN
/interface ovpn-server server
add auth=sha1,md5 mac-address=FE:76:98:4C:7C:76 name=ovpn-server1
/ip address
add address=192.168.88.1/24 comment=defconf interface=bridge network=\
    192.168.88.0
/ip dhcp-client
add interface=bridge
/ip dhcp-server network
add address=192.168.88.0/24 comment=defconf dns-server=192.168.88.1 gateway=\
    192.168.88.1
/ip dns
set allow-remote-requests=yes
/ip dns static
add address=192.168.88.1 comment=defconf name=router.lan type=A
/ip firewall filter
add action=accept chain=input comment=\
    "defconf: accept established,related,untracked" connection-state=\
    established,related,untracked
add action=drop chain=input comment="defconf: drop invalid" connection-state=\
    invalid
add action=accept chain=input comment="defconf: accept ICMP" protocol=icmp
add action=accept chain=input comment=\
    "defconf: accept to local loopback (for CAPsMAN)" dst-address=127.0.0.1
add action=drop chain=input comment="defconf: drop all not coming from LAN" \
    in-interface-list=!LAN
add action=accept chain=forward comment="defconf: accept in ipsec policy" \
    ipsec-policy=in,ipsec
add action=accept chain=forward comment="defconf: accept out ipsec policy" \
    ipsec-policy=out,ipsec
add action=fasttrack-connection chain=forward comment="defconf: fasttrack" \
    connection-state=established,related hw-offload=yes
add action=accept chain=forward comment=\
    "defconf: accept established,related, untracked" connection-state=\
    established,related,untracked
add action=drop chain=forward comment="defconf: drop invalid" \
    connection-state=invalid
add action=drop chain=forward comment=\
    "defconf: drop all from WAN not DSTNATed" connection-nat-state=!dstnat \
    connection-state=new in-interface-list=WAN
/ip ipsec profile
set [ find default=yes ] dpd-interval=2m dpd-maximum-failures=5
/ip service
set ftp disabled=yes
set telnet disabled=yes
set www disabled=yes
set api disabled=yes
set api-ssl disabled=yes
/ip ssh
set always-allow-password-login=yes
/routing bfd configuration
add disabled=no interfaces=all min-rx=200ms min-tx=200ms multiplier=5
/system clock
set time-zone-name=Europe/Vienna
/tool mac-server
set allowed-interface-list=LAN
/tool mac-server mac-winbox
set allowed-interface-list=LAN
