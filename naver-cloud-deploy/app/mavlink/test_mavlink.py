from pymavlink import mavutil

mav = mavutil.mavlink_connection("COM5", baud=115200)
mav.wait_heartbeat(timeout=5)
print("CONNECTED", mav.target_system)
