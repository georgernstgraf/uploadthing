#!/usr/bin/env -S awk -f
{
printf "%s,", $1;
}
END {
printf "\b \b\n";
}
