# get apple monterey working

MACHINE=capitan
VBoxManage modifyvm     "${MACHINE}" --cpuidset 00000001 000306a9 04100800 7fbae3ff bfebfbff
VBoxManage setextradata "${MACHINE}" "VBoxInternal/Devices/efi/0/Config/DmiSystemProduct" "MacBookPro11,3"
VBoxManage setextradata "${MACHINE}" "VBoxInternal/Devices/efi/0/Config/DmiSystemVersion" "1.0"
VBoxManage setextradata "${MACHINE}" "VBoxInternal/Devices/efi/0/Config/DmiBoardProduct" "Mac-2BD1B31983FE1663"
VBoxManage setextradata "${MACHINE}" "VBoxInternal/Devices/smc/0/Config/DeviceKey" "ourhardworkbythesewordsguardedpleasedontsteal(c)AppleComputerInc"
VBoxManage setextradata "${MACHINE}" "VBoxInternal/Devices/smc/0/Config/GetKeyFromRealSMC" 1
VBoxManage setextradata "${MACHINE}" "VBoxInternal/Devices/smc/0/Config/GetKeyFromRealSMC" 0
VBoxManage modifyvm "${MACHINE}" --cpus 4
VBoxManage modifyvm "${MACHINE}" --memory 8192
VBoxManage modifyvm "${MACHINE}" --vram 128
VBoxManage modifyvm "${MACHINE}" --accelerate3d on
VBoxManage modifyvm "${MACHINE}" --chipset piix3
VBoxManage modifyvm     "${MACHINE}" --cpu-profile "Intel Core i7-6700K"
