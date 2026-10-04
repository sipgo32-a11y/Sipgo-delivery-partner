import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [phone, setPhone] = useState('')
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')

  const [partner, setPartner] = useState(null)
  const [verificationNeeded, setVerificationNeeded] = useState(false)
  const [verificationBlocked, setVerificationBlocked] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState('')

  const [cameraOpen, setCameraOpen] = useState(false)
  const [photoTaken, setPhotoTaken] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  const [isOnline, setIsOnline] = useState(false)
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)

  const [orders, setOrders] = useState([])
  const [message, setMessage] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)

  const [profileStats, setProfileStats] = useState({
    totalOrders: 0,
    totalEarnings: 0,
    weekOrders: 0,
    weekEarnings: 0
  })

  const [acceptedOrderIds, setAcceptedOrderIds] = useState([])

  const alertTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    setCameraOpen(false)
  }

  useEffect(() => {
    return () => stopCamera()
  }, [])

  const loadProfileStats = async (partnerId) => {
    if (!partnerId) return

    const { data, error } = await supabase
      .from('sipgo_orders')
      .select('id,total_amount,delivery_fee,status,delivered_at')
      .eq('delivery_partner_id', partnerId)
      .eq('status', 'DELIVERED')

    if (error) {
      console.error('PROFILE STATS ERROR:', error)
      return
    }

    const completed = data || []

    const totalOrders = completed.length

    const totalEarnings = completed.reduce(
      (sum, order) =>
        sum + Number(order.delivery_fee || 0),
      0
    )

    const now = new Date()
    const day = now.getDay()
    const daysFromMonday = day === 0 ? 6 : day - 1

    const weekStart = new Date(now)
    weekStart.setDate(
      now.getDate() - daysFromMonday
    )
    weekStart.setHours(0, 0, 0, 0)

    const thisWeek = completed.filter((order) => {
      if (!order.delivered_at) return false

      return (
        new Date(order.delivered_at) >= weekStart
      )
    })

    const weekOrders = thisWeek.length

    const weekEarnings = thisWeek.reduce(
      (sum, order) =>
        sum + Number(order.delivery_fee || 0),
      0
    )

    setProfileStats({
      totalOrders,
      totalEarnings,
      weekOrders,
      weekEarnings
    })
  }

  const loadPartner = async () => {
    if (!session?.user?.id) return

    const { data, error } = await supabase
      .from('delivery_partners')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()

    if (error) {
      console.error(error)
      setMessage('❌ Partner profile load failed.')
      return
    }

    if (!data) {
      setPartner(null)
      setVerificationNeeded(true)
      setVerificationMessage('❌ Partner profile not found.')
      return
    }

    setPartner(data)

    if (data.profile_photo_url) {
      const { data: signedPhoto } = await supabase.storage
        .from('partner-photos')
        .createSignedUrl(
          data.profile_photo_url,
          86400
        )

      if (signedPhoto?.signedUrl) {
        setProfilePhotoPreview(
          signedPhoto.signedUrl
        )
      }
    }

    await loadProfileStats(data.id)

    setPartnerName(data.Name || '')
    setPhone(data.Phone || '')
    setIsOnline(Boolean(data.Is_online))
    setLatitude(data.Latitude || null)
    setLongitude(data.longitude || null)

    checkDailyVerification(data)
  }

  const checkDailyVerification = (data) => {
    const blockedUntil = data.verification_blocked_until

    if (blockedUntil) {
      const blockedTime = new Date(blockedUntil).getTime()

      if (blockedTime > Date.now()) {
        setVerificationBlocked(true)
        setVerificationNeeded(true)
        setVerificationMessage(
          '🚫 Photo verification temporarily blocked. Try again after the block period.'
        )
        return
      }
    }

    setVerificationBlocked(false)

    if (!data.photo_verified_at) {
      setVerificationNeeded(true)
      return
    }

    const verifiedDate = new Date(
      data.photo_verified_at
    ).toLocaleDateString('en-IN')

    const today = new Date().toLocaleDateString('en-IN')

    if (verifiedDate === today) {
      setVerificationNeeded(false)
      return
    }

    setVerificationNeeded(true)
  }

  useEffect(() => {
    if (!session || showProfile || mapRef.current || !mapContainerRef.current) {
      return
    }

    const startLat = latitude ?? 20.5937
    const startLng = longitude ?? 78.9629

    const map = L.map(mapContainerRef.current, {
      zoomControl: false
    }).setView([startLat, startLng], latitude && longitude ? 15 : 5)

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }
    ).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    mapRef.current = map

    if (latitude && longitude) {
      markerRef.current = L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup('📍 Your current location')
    }

    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markerRef.current = null
      }
    }
  }, [session, showProfile])

  useEffect(() => {
    if (!mapRef.current || latitude == null || longitude == null) {
      return
    }

    const position = [latitude, longitude]

    if (!markerRef.current) {
      markerRef.current = L.marker(position)
        .addTo(mapRef.current)
        .bindPopup('📍 Your current location')
    } else {
      markerRef.current.setLatLng(position)
    }

    mapRef.current.setView(position, 15)
  }, [latitude, longitude])

  useEffect(() => {
    if (session) {
      loadPartner()
    } else {
      setPartner(null)
      setVerificationNeeded(false)
      setIsOnline(false)
    }
  }, [session])

  const handleAuth = async (e) => {
    e.preventDefault()
    setMessage('')

    if (!email || !password) {
      setMessage('❌ Email and password enter madi.')
      return
    }

    if (mode === 'register') {
      if (!partnerName || !phone) {
        setMessage('❌ Name and phone number enter madi.')
        return
      }

      if (!profilePhoto) {
        setMessage('❌ Profile photo compulsory. Photo thagoli.')
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password
      })

      if (error) {
        setMessage('❌ ' + error.message)
        return
      }

      if (!data.user) {
        setMessage('❌ Account create aglilla.')
        return
      }

      if (!data.session) {
        setMessage(
          '✅ Account created. Email verify madi, then Login madi.'
        )
        return
      }

      const extension =
        profilePhoto.name.split('.').pop()?.toLowerCase() || 'jpg'

      const photoPath =
        `${data.user.id}/profile.${extension}`

      const { error: photoError } = await supabase.storage
        .from('partner-photos')
        .upload(
          photoPath,
          profilePhoto,
          {
            upsert: true,
            contentType: profilePhoto.type || 'image/jpeg'
          }
        )

      if (photoError) {
        setMessage(
          '❌ Profile photo save failed: ' +
          photoError.message
        )
        return
      }

      const { error: partnerError } = await supabase
        .from('delivery_partners')
        .insert({
          auth_user_id: data.user.id,
          Name: partnerName,
          Phone: phone,
          Is_online: false,
          verification_status: 'PENDING',
          verification_attempts: 0,
          profile_photo_url: photoPath
        })

      if (partnerError) {
        setMessage(
          '❌ Partner profile create failed: ' +
          partnerError.message
        )
        return
      }

      setMessage('✅ Partner account created!')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage('❌ ' + error.message)
      return
    }

    setMessage('✅ Login successful!')
  }

  const logout = async () => {
    stopCamera()

    if (session?.user?.id) {
      await supabase
        .from('delivery_partners')
        .update({
          Is_online: false
        })
        .eq('auth_user_id', session.user.id)
    }

    setIsOnline(false)
    await supabase.auth.signOut()
  }

  const updatePartner = async (updates) => {
    if (!session?.user?.id) return false

    const { error } = await supabase
      .from('delivery_partners')
      .update(updates)
      .eq('auth_user_id', session.user.id)

    if (error) {
      console.error(error)
      setMessage('❌ Partner update failed.')
      return false
    }

    setPartner((old) => ({
      ...(old || {}),
      ...updates
    }))

    return true
  }

  const startCamera = async () => {
    setVerificationMessage('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setVerificationMessage(
        '❌ Camera not supported in this browser.'
      )
      return
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 720 }
          },
          audio: false
        })

      streamRef.current = stream
      setCameraOpen(true)
      setPhotoTaken(false)

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (error) {
      console.error(error)
      setVerificationMessage(
        '❌ Camera permission kodi guru.'
      )
    }
  }

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 720

    const context = canvas.getContext('2d')

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    )

    setPhotoTaken(true)
  }

  const confirmDailyPhoto = async () => {
    if (!photoTaken) {
      setVerificationMessage('❌ First photo capture madi.')
      return
    }

    setVerificationMessage('⏳ Saving verification...')

    if (!session?.user?.id) {
      setVerificationMessage('❌ Login session not found.')
      return
    }

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('delivery_partners')
      .update({
        verification_status: 'VERIFIED',
        verification_attempts: 0,
        verification_blocked_until: null,
        photo_verified_at: now
      })
      .eq('auth_user_id', session.user.id)

    if (error) {
      console.error('PHOTO VERIFICATION ERROR:', error)
      setVerificationMessage(
        '❌ Verification failed: ' + error.message
      )
      return
    }

    setVerificationMessage('✅ Photo verification successful!')

    stopCamera()
    setPhotoTaken(false)
    setVerificationBlocked(false)
    setVerificationNeeded(false)

    await loadPartner()
  }

  const retakePhoto = () => {
    setPhotoTaken(false)

    if (canvasRef.current) {
      const context =
        canvasRef.current.getContext('2d')

      context.clearRect(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      )
    }
  }

  const getLiveLocation = () => {
    if (!navigator.geolocation) {
      setMessage('❌ Live location supported alla.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        setLatitude(lat)
        setLongitude(lng)

        await updatePartner({
          Latitude: lat,
          longitude: lng,
          last_location_at: new Date().toISOString()
        })
      },
      () => {
        setMessage('❌ Location permission denied.')
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    )
  }

  const toggleOnline = async () => {
    const newStatus = !isOnline

    setIsOnline(newStatus)

    const success = await updatePartner({
      Is_online: newStatus
    })

    if (!success) {
      setIsOnline(!newStatus)
      return
    }

    if (newStatus) {
      getLiveLocation()
    }
  }

  const loadAssignedOrders = async () => {
    setLoadingOrders(true)

    const { data, error } = await supabase
      .from('sipgo_orders')
      .select('*')
      .eq('delivery_partner_id', partner.id)
      .in('status', [
        'PARTNER_ASSIGNED',
        'REACHED_MERCHANT',
        'PICKED_UP',
        'OUT_FOR_DELIVERY'
      ])
      .order('created_at', {
        ascending: false
      })

    if (error) {
      console.error(error)
      setMessage(
        '❌ Orders load failed: ' +
        error.message
      )
      setOrders([])
    } else {
      setOrders(data || [])
    }

    setLoadingOrders(false)
  }

  useEffect(() => {
    if (!session || verificationNeeded) return

    loadAssignedOrders()

    const timer = setInterval(() => {
      loadAssignedOrders()
    }, 10000)

    return () => clearInterval(timer)
  }, [session, verificationNeeded])

  useEffect(() => {
    if (
      !session ||
      verificationNeeded ||
      !isOnline
    ) {
      return
    }

    const timer = setInterval(() => {
      getLiveLocation()
    }, 15000)

    return () => clearInterval(timer)
  }, [
    session,
    verificationNeeded,
    isOnline
  ])

  const updateOrderStatus = async (
    orderId,
    newStatus
  ) => {
    const updateData = {
      status: newStatus
    }

    if (newStatus === 'PICKED_UP') {
      updateData.picked_up_at =
        new Date().toISOString()
    }

    if (newStatus === 'DELIVERED') {
      updateData.delivered_at =
        new Date().toISOString()
    }

    const { error } = await supabase
      .from('sipgo_orders')
      .update(updateData)
      .eq('id', orderId)

    if (error) {
      alert(
        '❌ Status update failed: ' +
        error.message
      )
      return
    }

    alert('✅ Order status updated')
    loadAssignedOrders()
  }

  const stopOrderAlert = () => {
    if (alertTimerRef.current) {
      clearInterval(alertTimerRef.current)
      alertTimerRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }

  const startOrderAlert = () => {
    if (alertTimerRef.current) return

    const beep = async () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current =
            new (window.AudioContext ||
              window.webkitAudioContext)()
        }

        const ctx = audioContextRef.current

        if (ctx.state === 'suspended') {
          await ctx.resume()
        }

        const oscillator =
          ctx.createOscillator()

        const gain = ctx.createGain()

        oscillator.type = 'sine'
        oscillator.frequency.value = 880

        gain.gain.setValueAtTime(
          0.001,
          ctx.currentTime
        )

        gain.gain.exponentialRampToValueAtTime(
          0.25,
          ctx.currentTime + 0.03
        )

        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + 0.35
        )

        oscillator.connect(gain)
        gain.connect(ctx.destination)

        oscillator.start()
        oscillator.stop(ctx.currentTime + 0.35)
      } catch (error) {
        console.log('Alert sound blocked:', error)
      }
    }

    beep()
    alertTimerRef.current =
      setInterval(beep, 1200)
  }

  useEffect(() => {
    const waitingForAccept = orders.some(
      (order) =>
        order.status === 'PARTNER_ASSIGNED' &&
        !acceptedOrderIds.includes(order.id)
    )

    if (waitingForAccept) {
      startOrderAlert()
    } else {
      stopOrderAlert()
    }
  }, [orders, acceptedOrderIds])


  useEffect(() => {
    return () => stopOrderAlert()
  }, [])
  
  useEffect(() => {
    if (!partner?.id) return

    loadAssignedOrders()

    const channel = supabase
      .channel(
        `partner-orders-${partner.id}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sipgo_orders',
          filter:
            `delivery_partner_id=eq.${partner.id}`
        },
        () => {
          loadAssignedOrders()
          loadProfileStats(partner.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [partner?.id])

  useEffect(() => {
    if (showProfile && partner?.id) {
      loadProfileStats(partner.id)
    }
  }, [showProfile, partner?.id])


  if (loading) {
    return (
      <div className="deliveryApp">
        <main className="deliveryMain">
          <section className="deliveryCard">
            <h1>SIPGO</h1>
            <p>Loading...</p>
          </section>
        </main>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="deliveryApp">
        <header className="deliveryHeader">
          <div className="brand">
            SIP<span>GO</span>
          </div>

          <div className="partnerLabel">
            DELIVERY PARTNER
          </div>
        </header>

        <main className="deliveryMain">
          <section className="deliveryCard">

            <h1>🚴 Delivery Partner</h1>

            <h2>
              {mode === 'login'
                ? 'Partner Login'
                : 'Create Partner Account'}
            </h2>

            {mode === 'register' && (
              <>
                <label>Partner name</label>

                <input
                  value={partnerName}
                  onChange={(e) =>
                    setPartnerName(e.target.value)
                  }
                  placeholder="Enter your name"
                />

                <label>Phone number</label>

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  placeholder="Enter phone number"
                />

                <label>Profile Photo</label>

                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) => {
                    const file = e.target.files?.[0]

                    if (!file) return

                    setProfilePhoto(file)
                    setProfilePhotoPreview(
                      URL.createObjectURL(file)
                    )
                    setMessage('')
                  }}
                />

                {profilePhotoPreview && (
                  <div className="locationBox">
                    <strong>📷 Profile Photo Preview</strong>

                    <img
                      src={profilePhotoPreview}
                      alt="Profile preview"
                      style={{
                        width: '140px',
                        height: '140px',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        display: 'block',
                        margin: '15px auto'
                      }}
                    />

                    <p style={{ textAlign: 'center' }}>
                      ✅ Photo selected
                    </p>
                  </div>
                )}
              </>
            )}

            <form onSubmit={handleAuth}>

              <label>Email</label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="partner@example.com"
              />

              <label>Password</label>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Minimum 6 characters"
              />

              <button
                className="onlineButton"
                type="submit"
              >
                {mode === 'login'
                  ? '🔐 Login'
                  : '📝 Create Account'}
              </button>

            </form>

            {message && <p>{message}</p>}

            <button
              className="locationButton"
              onClick={() => {
                setMessage('')
                setMode(
                  mode === 'login'
                    ? 'register'
                    : 'login'
                )
              }}
            >
              {mode === 'login'
                ? 'New partner? Create account'
                : 'Already have account? Login'}
            </button>

          </section>
        </main>
      </div>
    )
  }

  if (verificationNeeded) {
    return (
      <div className="deliveryApp">

        <header className="deliveryHeader">
          <div className="brand">
            SIP<span>GO</span>
          </div>

          <div className="partnerLabel">
            DAILY PARTNER VERIFICATION
          </div>
        </header>

        <main className="deliveryMain">

          <section className="deliveryCard">

            <canvas
              ref={canvasRef}
              style={{ display: 'none' }}
            />

            <h1>📸 Daily Photo Check</h1>

            <p>
              Login successful. Before going online,
              complete today's photo verification.
            </p>

            <p>
              This check is required once per day.
            </p>

            {verificationBlocked ? (
              <>
                <div className="locationBox">
                  <strong>🚫 Verification Blocked</strong>
                  <p>
                    Daily photo verification is
                    temporarily blocked.
                  </p>
                </div>
              </>
            ) : (
              <>
                {!cameraOpen && !photoTaken && (
                  <button
                    className="onlineButton"
                    onClick={startCamera}
                  >
                    📷 Open Camera
                  </button>
                )}

                {cameraOpen && !photoTaken && (
                  <div className="locationBox">

                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        borderRadius: '16px',
                        background: '#000'
                      }}
                    />

                    <button
                      className="onlineButton"
                      onClick={takePhoto}
                    >
                      📸 Take Photo
                    </button>

                    <button
                      className="locationButton"
                      onClick={stopCamera}
                    >
                      Cancel Camera
                    </button>

                  </div>
                )}

                {photoTaken && (
                  <div className="locationBox">

                    <canvas
                      ref={canvasRef}
                      style={{
                        width: '100%',
                        borderRadius: '16px',
                        display: 'block'
                      }}
                    />

                    <button
                      className="onlineButton"
                      onClick={confirmDailyPhoto}
                    >
                      ✅ Confirm Today's Photo
                    </button>

                    <button
                      className="locationButton"
                      onClick={retakePhoto}
                    >
                      🔄 Retake Photo
                    </button>

                  </div>
                )}

                {verificationMessage && (
                  <p>
                    {verificationMessage}
                  </p>
                )}
              </>
            )}

            <button
              className="locationButton"
              onClick={logout}
            >
              🚪 Logout
            </button>

          </section>

        </main>
      </div>
    )
  }


  return (
    <div className="deliveryApp">

      {showProfile && (
        <header className="deliveryHeader">
          <div className="brand">
            SIP<span>GO</span>
          </div>

          <div className="partnerLabel">
            DELIVERY PARTNER
          </div>
        </header>
      )}

      <main className="deliveryMain">

        {showProfile ? (
          <section className="deliveryCard profilePage">

            <h1>👤 Partner Profile</h1>

            {profilePhotoPreview && (
              <div className="profilePhotoWrap">
                <img
                  src={profilePhotoPreview}
                  alt="Partner profile"
                  className="profilePhoto"
                />
              </div>
            )}

            <div className="locationBox">

              <p>
                <strong>🆔 Partner ID</strong><br />
                <span className="partnerIdValue">
                  {partner?.id
                    ? `SIPGO-DP-${String(partner.id).padStart(6, '0')}`
                    : 'Loading...'}
                </span>
              </p>

              <p>
                <strong>👤 Name</strong><br />
                {partner?.Name || 'Not available'}
              </p>

              <p>
                <strong>📞 Phone</strong><br />
                {partner?.Phone || 'Not available'}
              </p>

              <p>
                <strong>📧 Email</strong><br />
                {session.user.email}
              </p>

              <p>
                <strong>Verification</strong><br />
                {partner?.verification_status === 'VERIFIED'
                  ? '🟢 Verified'
                  : '🔴 Not Verified'}
              </p>

            </div>

            <div className="statsGrid">

              <div className="statCard">
                <span>📦</span>
                <strong>{profileStats.totalOrders}</strong>
                <small>My Orders</small>
              </div>

              <div className="statCard">
                <span>💰</span>
                <strong>
                  ₹{profileStats.totalEarnings.toFixed(2)}
                </strong>
                <small>Total Earnings</small>
              </div>

              <div className="statCard">
                <span>📅</span>
                <strong>{profileStats.weekOrders}</strong>
                <small>This Week Orders</small>
              </div>

              <div className="statCard">
                <span>💵</span>
                <strong>
                  ₹{profileStats.weekEarnings.toFixed(2)}
                </strong>
                <small>This Week Earnings</small>
              </div>

            </div>

            <p className="weekNote">
              🔄 This Week automatic update agutte.
            </p>

            <button
              className="locationButton"
              onClick={() => setShowProfile(false)}
            >
              ← Back to Dashboard
            </button>

            <button
              className="locationButton"
              onClick={logout}
            >
              🚪 Logout
            </button>

          </section>
        ) : (
          <section className="mapDashboard">

            <div
              className={
                isOnline
                  ? 'partnerOnlineBadge online'
                  : 'partnerOnlineBadge offline'
              }
            >
              {isOnline
                ? '🟢 PARTNER ONLINE'
                : '🔴 PARTNER OFFLINE'}
            </div>

            <div
              ref={mapContainerRef}
              className="fullMap"
            />

            <div className="mapTopBar">

              <button
                className={
                  isOnline
                    ? 'mapToggleButton online'
                    : 'mapToggleButton'
                }
                onClick={toggleOnline}
              >
                {isOnline
                  ? '🟢 ONLINE'
                  : '⚫ OFFLINE'}
              </button>

              <button
                className="mapProfileButton"
                onClick={() => setShowProfile(true)}
              >
                👤 Profile
              </button>

            </div>

            <button
              className="mapLocationButton"
              onClick={getLiveLocation}
              title="Refresh Location"
            >
              🔄
            </button>

            <div className="mapOrdersOverlay">

              {loadingOrders && (
                <div className="mapOrderCard">
                  ⏳ Checking orders...
                </div>
              )}

              {orders.map((order) => {
                const accepted =
                  acceptedOrderIds.includes(order.id)

                return (
                  <div
                    key={order.id}
                    className={
                      order.status === 'PARTNER_ASSIGNED'
                        ? 'mapOrderCard newOrder'
                        : 'mapOrderCard'
                    }
                  >

                    {order.status === 'PARTNER_ASSIGNED' && (
                      <div className="newOrderTitle">
                        🔔 NEW ORDER
                      </div>
                    )}

                    <strong>
                      Order #{order.id}
                    </strong>

                    <p>
                      🏪 Shop ID: {order.shop_id}
                    </p>

                    <p>
                      💰 Order Value: ₹
                      {Number(
                        order.total_amount || 0
                      ).toFixed(2)}
                    </p>

                    <p>
                      Status: {order.status}
                    </p>

                    {order.status === 'PARTNER_ASSIGNED' &&
                      !accepted && (
                        <button
                          className="mapActionButton accept"
                          onClick={async () => {
                            if (!partner?.id) {
                              alert('❌ Partner profile not found')
                              return
                            }

                            const { data, error } =
                              await supabase.rpc(
                                'partner_accept_order',
                                {
                                  p_order_id: order.id,
                                  p_partner_id: partner.id
                                }
                              )

                            if (error) {
                              alert(
                                '❌ Order accept failed: ' +
                                error.message
                              )
                              return
                            }

                            if (!data) {
                              alert('❌ Order is no longer available')
                              return
                            }

                            setAcceptedOrderIds((prev) => [
                              ...new Set([
                                ...prev,
                                order.id
                              ])
                            ])

                            stopOrderAlert()
                            await loadAssignedOrders()

                            alert(
                              '✅ Order #' +
                              order.id +
                              ' accepted'
                            )
                          }}
                        >
                          🔔 ACCEPT ORDER
                        </button>
                      )}

                    {order.status === 'PARTNER_ASSIGNED' &&
                      accepted && (
                        <button
                          className="mapActionButton"
                          onClick={() =>
                            updateOrderStatus(
                              order.id,
                              'REACHED_MERCHANT'
                            )
                          }
                        >
                          📍 Reached Merchant
                        </button>
                      )}

                    {order.status === 'REACHED_MERCHANT' && (
                      <button
                        className="mapActionButton"
                        onClick={() =>
                          updateOrderStatus(
                            order.id,
                            'PICKED_UP'
                          )
                        }
                      >
                        📦 Confirm Handover / Pick Up
                      </button>
                    )}

                    {order.status === 'PICKED_UP' && (
                      <button
                        className="mapActionButton"
                        onClick={() =>
                          updateOrderStatus(
                            order.id,
                            'OUT_FOR_DELIVERY'
                          )
                        }
                      >
                        🚴 Start Delivery
                      </button>
                    )}

                    {order.status === 'OUT_FOR_DELIVERY' && (
                      <button
                        className="mapActionButton"
                        onClick={async () => {
                          await updateOrderStatus(
                            order.id,
                            'DELIVERED'
                          )

                          setAcceptedOrderIds((prev) =>
                            prev.filter(
                              (id) => id !== order.id
                            )
                          )

                          await loadProfileStats(
                            partner?.id
                          )
                        }}
                      >
                        ✅ Delivered
                      </button>
                    )}

                  </div>
                )
              })}

            </div>

          </section>
        )}


        </main>
      </div>
  )
}

export default App
