import { useEffect, useRef, useState } from 'react'
import { registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const OnlineOverlay = registerPlugin('OnlineOverlay')

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
  const [editingProfile, setEditingProfile] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [rcPhoto, setRcPhoto] = useState(null)
  const [rcPhotoPreview, setRcPhotoPreview] = useState('')
  const [activeTab, setActiveTab] = useState('home')
  const [navigationOrder, setNavigationOrder] = useState(null)
  const [showNotifications, setShowNotifications] = useState(false)

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
    setVehicleNumber(data.vehicle_number || '')

    if (data.rc_photo_url) {
      const { data: signedRc } = await supabase.storage
        .from('partner-photos')
        .createSignedUrl(data.rc_photo_url, 60 * 60 * 24 * 7)

      if (signedRc?.signedUrl) {
        setRcPhotoPreview(signedRc.signedUrl)
      }
    } else {
      setRcPhotoPreview('')
    }
    setIsOnline(Boolean(data.Is_online))
    setLatitude(data.Latitude || null)
    setLongitude(data.longitude || null)

    checkDailyVerification(data)
  }

  const saveProfileChanges = async () => {
    if (!partner?.id || !session?.user?.id) {
      alert('❌ Partner profile not found')
      return
    }

    const cleanName = editName.trim()
    const cleanPhone = editPhone.replace(/\D/g, '')
    const cleanEmail = editEmail.trim()

    if (!cleanName) {
      alert('❌ Name compulsory')
      return
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      alert('❌ Valid 10 digit Indian mobile number enter madi')
      return
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      alert('❌ Valid email enter madi')
      return
    }

    setSavingProfile(true)

    try {
      let photoPath = partner.profile_photo_url || null

      if (profilePhoto) {
        const extension =
          profilePhoto.name.split('.').pop()?.toLowerCase() || 'jpg'

        photoPath =
          `${session.user.id}/profile.${extension}`

        const { error: uploadError } = await supabase.storage
          .from('partner-photos')
          .upload(
            photoPath,
            profilePhoto,
            {
              upsert: true,
              contentType: profilePhoto.type || 'image/jpeg'
            }
          )

        if (uploadError) {
          throw new Error(
            'Profile photo save failed: ' +
            uploadError.message
          )
        }
      }

      let rcPath = partner.rc_photo_url || null

      if (rcPhoto) {
        const rcExtension =
          rcPhoto.name.split('.').pop()?.toLowerCase() || 'jpg'

        rcPath = `${session.user.id}/rc.${rcExtension}`

        const { error: rcUploadError } = await supabase.storage
          .from('partner-photos')
          .upload(
            rcPath,
            rcPhoto,
            {
              upsert: true,
              contentType: rcPhoto.type || 'image/jpeg'
            }
          )

        if (rcUploadError) {
          throw new Error(
            'RC photo save failed: ' + rcUploadError.message
          )
        }
      }

      const updateData = {
        Name: cleanName,
        Phone: cleanPhone,
        vehicle_number: vehicleNumber.trim() || null,
        rc_photo_url: rcPath
      }

      if (photoPath) {
        updateData.profile_photo_url = photoPath
      }

      const { data: updatedPartner, error: partnerError } =
        await supabase
          .from('delivery_partners')
          .update(updateData)
          .eq('id', partner.id)
          .select('*')
          .single()

      if (partnerError) {
        throw new Error(
          'Profile update failed: ' +
          partnerError.message
        )
      }

      let emailMessage = ''

      if (
        cleanEmail.toLowerCase() !==
        String(session.user.email || '').toLowerCase()
      ) {
        const { error: emailError } =
          await supabase.auth.updateUser({
            email: cleanEmail
          })

        if (emailError) {
          throw new Error(
            'Email update failed: ' +
            emailError.message
          )
        }

        emailMessage =
          ' Email verification link new email-ge send agide.'
      }

      let finalPartner = updatedPartner

      if (photoPath) {
        const { data: signedPhoto } =
          await supabase.storage
            .from('partner-photos')
            .createSignedUrl(photoPath, 60 * 60 * 24 * 7)

        if (signedPhoto?.signedUrl) {
          setProfilePhotoPreview(signedPhoto.signedUrl)
        }
      }

      if (rcPath) {
        const { data: signedRc } =
          await supabase.storage
            .from('partner-photos')
            .createSignedUrl(rcPath, 60 * 60 * 24 * 7)

        if (signedRc?.signedUrl) {
          setRcPhotoPreview(signedRc.signedUrl)
        }
      }

      finalPartner = {
        ...updatedPartner
      }

      setPartner(finalPartner)
      setPartnerName(cleanName)
      setPhone(cleanPhone)
      setEmail(cleanEmail)
      setVehicleNumber(vehicleNumber.trim())
      setRcPhoto(null)
      setProfilePhoto(null)
      setEditingProfile(false)
      setMessage('✅ Profile updated successfully.' + emailMessage)

      await loadPartner()

    } catch (error) {
      alert('❌ ' + error.message)
    } finally {
      setSavingProfile(false)
    }
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
    if (!session || showProfile || activeTab !== 'home' || !mapContainerRef.current) {
      return
    }

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return

      // Remove any old Leaflet instance before creating a new one
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch (e) {}
        mapRef.current = null
        markerRef.current = null
      }

      const startLat = latitude ?? 20.5937
      const startLng = longitude ?? 78.9629

      const map = L.map(mapContainerRef.current, {
        zoomControl: false
      }).setView(
        [startLat, startLng],
        latitude && longitude ? 15 : 5
      )

      L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }
      ).addTo(map)

      L.control.zoom({
        position: 'bottomright'
      }).addTo(map)

      mapRef.current = map

      if (latitude && longitude) {
        markerRef.current = L.marker([latitude, longitude])
          .addTo(map)
          .bindPopup('↻ Your current location')
      }

      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize()
        }
      }, 300)
    }, 100)

    return () => {
      clearTimeout(timer)

      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch (e) {}

        mapRef.current = null
        markerRef.current = null
      }
    }
  }, [session, showProfile, activeTab])

  useEffect(() => {
    if (!mapRef.current || latitude == null || longitude == null) {
      return
    }

    const position = [latitude, longitude]

    if (!markerRef.current) {
      markerRef.current = L.marker(position)
        .addTo(mapRef.current)
        .bindPopup('↻ Your current location')
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

    if (newStatus) {
      try {
        if (window.Capacitor?.isNativePlatform?.()) {
          await OnlineOverlay.start()
        }
      } catch (error) {
        console.log('Overlay start:', error)

        if (
          error?.message?.includes('OVERLAY_PERMISSION_REQUIRED') ||
          error?.code === 'OVERLAY_PERMISSION_REQUIRED'
        ) {
          alert(
            'Please allow SIPGO to display over other apps, then tap ONLINE again.'
          )
          return
        }
      }
    } else {
      try {
        if (window.Capacitor?.isNativePlatform?.()) {
          await OnlineOverlay.stop()
        }
      } catch (error) {
        console.log('Overlay stop:', error)
      }
    }

    setIsOnline(newStatus)

    const success = await updatePartner({
      Is_online: newStatus
    })

    if (!success) {
      setIsOnline(!newStatus)

      try {
        if (window.Capacitor?.isNativePlatform?.()) {
          if (newStatus) {
            await OnlineOverlay.stop()
          } else {
            await OnlineOverlay.start()
          }
        }
      } catch (error) {
        console.log('Overlay rollback:', error)
      }

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

    // 🔔 Ask notification permission once
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const showOrderNotification = () => {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🛵 New SIPGO Order', {
            body: 'New delivery order assigned. Open SIPGO Delivery Partner.',
            tag: 'sipgo-new-order',
            requireInteraction: true
          })
        }

        // 📳 Vibrate phone
        if ('vibrate' in navigator) {
          navigator.vibrate([300, 150, 300, 150, 500])
        }
      } catch (error) {
        console.log('Notification/vibration blocked:', error)
      }
    }

    showOrderNotification()

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

                <label>Phone number <span style={{color:"#ef4444"}}>*</span></label>

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  placeholder="Enter phone number" required inputMode="tel"
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
          <section className="officialProfilePage">

  {!editingProfile ? (
    <>
      <div className="officialProfileHeader">
        <div className="officialProfileAvatar">
          {profilePhotoPreview ? (
            <img
              src={profilePhotoPreview}
              alt="Partner"
            />
          ) : (
            <span>👤</span>
          )}
        </div>

        <div>
          <h1>Partner Profile</h1>
          <p>SIPGO DELIVERY PARTNER</p>
        </div>
      </div>

      <div className="partnerIdCard">
        <span>PARTNER ID</span>
        <strong>
          {partner?.id
            ? `SIPGO-DP-${String(partner.id).padStart(6, '0')}`
            : 'Loading...'}
        </strong>
      </div>

      <div className="officialProfileDetails">

        <div className="officialDetailRow">
          <div className="officialDetailIcon">👤</div>
          <div>
            <small>FULL NAME</small>
            <strong>{partner?.Name || 'Not available'}</strong>
          </div>
        </div>

        <div className="officialDetailRow phoneDetail">
          <div className="officialDetailIcon">📞</div>
          <div>
            <small>MOBILE NUMBER</small>
            <strong>
              {partner?.Phone || 'Mobile number not available'}
            </strong>
          </div>
        </div>

        <div className="officialDetailRow">
          <div className="officialDetailIcon">📧</div>
          <div>
            <small>EMAIL ADDRESS</small>
            <strong>{session.user.email}</strong>
          </div>
        </div>

        <div className="officialDetailRow">
          <div className="officialDetailIcon">🛵</div>
          <div>
            <small>ROLE</small>
            <strong>Delivery Partner</strong>
          </div>
        </div>

        <div className="officialDetailRow">
          <div className="officialDetailIcon">🛵</div>
          <div>
            <small>VEHICLE NUMBER</small>
            <strong>{partner?.vehicle_number || 'Not added'}</strong>
          </div>
        </div>

        <div className="officialDetailRow">
          <div className="officialDetailIcon">📄</div>
          <div>
            <small>RC DOCUMENT</small>
            <strong>{partner?.rc_photo_url ? 'Uploaded' : 'Not uploaded'}</strong>
          </div>
        </div>

        <div className="officialDetailRow verificationRow">
          <div className="officialDetailIcon">🛡️</div>
          <div>
            <small>ACCOUNT VERIFICATION</small>
            <strong>
              {partner?.verification_status === 'VERIFIED'
                ? '🟢 Verified'
                : '🔴 Not Verified'}
            </strong>
          </div>
        </div>

      </div>

      <div className="officialCompanyCard">
        <strong>ORVELLIS PRIVATE LIMITED</strong>
        <span>SIPGO Delivery Platform</span>
      </div>

      <button
        type="button"
        className="officialEditButton"
        onClick={() => {
          setEditName(partner?.Name || '')
          setEditPhone(partner?.Phone || '')
          setEditEmail(session.user.email || '')
          setVehicleNumber(partner?.vehicle_number || '')
          setRcPhoto(null)
          setProfilePhoto(null)
          setEditingProfile(true)
        }}
      >
        ✏️ Edit Profile
      </button>

      <button
        type="button"
        className="officialDashboardButton"
        onClick={() => {
          setShowProfile(false)
          setShowNotifications(false)
          setNavigationOrder(null)
          setActiveTab('home')
          setTimeout(() => {
            mapRef.current?.invalidateSize()
          }, 400)
        }}
      >
        ← Back to Dashboard
      </button>

      <button
        type="button"
        className="officialLogoutButton"
        onClick={logout}
      >
        🚪 Logout
      </button>
    </>
  ) : (
    <>
      <div className="officialProfileHeader">
        <div className="officialProfileAvatar editAvatar">
          {profilePhotoPreview ? (
            <img
              src={profilePhotoPreview}
              alt="Partner"
            />
          ) : (
            <span>👤</span>
          )}
        </div>

        <div>
          <h1>Edit Profile</h1>
          <p>UPDATE YOUR SIPGO DETAILS</p>
        </div>
      </div>

      <div className="editPhotoCard">
        <label className="editPhotoButton">
          🖼️ Change Profile Photo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return

              setProfilePhoto(file)
              setProfilePhotoPreview(
                URL.createObjectURL(file)
              )
            }}
          />
        </label>
      </div>

      <div className="editProfileForm">

        <label>👤 Full Name</label>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Enter full name"
        />

        <label>📞 Mobile Number</label>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={editPhone}
          onChange={(e) =>
            setEditPhone(
              e.target.value.replace(/\D/g, '').slice(0, 10)
            )
          }
          placeholder="10 digit mobile number"
        />

        <label>📧 Email Address</label>
        <input
          type="email"
          value={editEmail}
          onChange={(e) => setEditEmail(e.target.value)}
          placeholder="Enter email address"
        />

        <div className="vehicleRcEditCard">
          <div className="vehicleRcTitle">
            <span>🛵</span>
            <div>
              <strong>Vehicle Details</strong>
              <small>Delivery partner verification</small>
            </div>
          </div>

          <label>🛵 Vehicle Number</label>
          <input
            type="text"
            value={vehicleNumber}
            onChange={(e) =>
              setVehicleNumber(e.target.value.toUpperCase())
            }
            placeholder="KA01AB1234"
            maxLength={15}
          />

          <div className="rcUploadRow">
            <div>
              <strong>📄 RC Photo</strong>
              <small>
                {rcPhoto
                  ? rcPhoto.name
                  : rcPhotoPreview
                    ? 'RC uploaded'
                    : 'RC not uploaded'}
              </small>
            </div>

            <label className="editPhotoButton">
              {rcPhotoPreview ? 'Change RC' : 'Upload RC'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setRcPhoto(file)
                  setRcPhotoPreview(URL.createObjectURL(file))
                }}
              />
            </label>
          </div>

          {rcPhotoPreview && (
            <img
              src={rcPhotoPreview}
              alt="RC Preview"
              className="rcPhotoPreview"
            />
          )}
        </div>

      </div>

      <button
        type="button"
        className="officialSaveButton"
        disabled={savingProfile}
        onClick={saveProfileChanges}
      >
        {savingProfile ? '⏳ Saving...' : '💾 Save Changes'}
      </button>

      <button
        type="button"
        className="officialCancelButton"
        disabled={savingProfile}
        onClick={() => {
          setEditingProfile(false)
          setProfilePhoto(null)
          setEditName('')
          setEditPhone('')
          setEditEmail('')
          setVehicleNumber(partner?.vehicle_number || '')
          setRcPhoto(null)
          setRcPhotoPreview(partner?.rc_photo_url ? rcPhotoPreview : '')
        }}
      >
        ✕ Cancel
      </button>
    </>
  )}

</section>
        ) : (
          <section className="sipgoDashboard">

  <header className="sipgoTopHeader">
    <div>
      <div className="sipgoLogo">SIP<span>GO</span></div>
      <small>LIQUOR DELIVERY</small>
    </div>

    <div className="sipgoHeaderActions">
      <button
        type="button"
        className="headerIconButton"
        onClick={() => setShowNotifications(prev => !prev)}
      >
        🔔
        {orders.filter(o => o.status === 'PARTNER_ASSIGNED').length > 0 && (
          <span className="notificationDot">
            {orders.filter(o => o.status === 'PARTNER_ASSIGNED').length}
          </span>
        )}
      </button>

      <button
        className="headerIconButton"
        onClick={() => setShowProfile(true)}
      >
        👤
      </button>
    </div>
  </header>

  {showNotifications && (
    <div className="notificationPanel">
      <div className="notificationPanelHeader">
        <strong>🔔 Notifications</strong>
        <button
          type="button"
          onClick={() => setShowNotifications(false)}
        >
          ✕
        </button>
      </div>

      <div className="notificationList">
        <div className="notificationItem">
          <div className="notificationIcon">👋</div>
          <div>
            <strong>Welcome to SIPGO</strong>
            <p>You are ready for liquor delivery.</p>
            <small>Now</small>
          </div>
        </div>

        {orders
          .filter(o => o.status === 'PARTNER_ASSIGNED')
          .map(order => (
            <div
              className="notificationItem"
              key={`notification-${order.id}`}
            >
              <div className="notificationIcon">🛵</div>
              <div>
                <strong>New Order Assigned</strong>
                <p>
                  Order #{order.id} is waiting for your action.
                </p>
                <small>SIPGO Delivery</small>
              </div>
            </div>
          ))}

        <div className="notificationItem">
          <div className="notificationIcon">📢</div>
          <div>
            <strong>SIPGO Updates</strong>
            <p>
              Keep your status ONLINE to receive delivery requests.
            </p>
            <small>SIPGO Team</small>
          </div>
        </div>
      </div>
    </div>
  )}

  {activeTab === 'home' && (
    <>
      <div className="partnerStatusCard">
        <button
          className={isOnline ? 'bigOnlineButton online' : 'bigOnlineButton'}
          onClick={toggleOnline}
        >
          {isOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
        </button>

        <div className="quickStat">
          <strong>{orders.length}</strong>
          <span>Orders</span>
        </div>

        <div className="quickStat">
          <strong>
            ₹{orders.reduce(
              (sum, o) => sum + Number(o.delivery_fee || 0),
              0
            ).toFixed(0)}
          </strong>
          <span>Today Earnings</span>
        </div>

        <div className="quickStat">
          <strong>₹0</strong>
          <span>Wallet</span>
        </div>
      </div>

      <div className="sipgoMapArea">
        <div ref={mapContainerRef} className="sipgoFullMap" />

        <button
          className="mapLocateButton"
          onClick={async () => {
            try {
              await getLiveLocation()
              setTimeout(() => {
                if (mapRef.current) {
                  mapRef.current.invalidateSize()
                  if (latitude && longitude) {
                    mapRef.current.setView([latitude, longitude], 16, {
                      animate: true
                    })
                  }
                }
              }, 700)
            } catch (error) {
              console.error('Refresh location failed:', error)
            }
          }}
          title="Refresh Location"
          type="button"
        >
          ↻
        </button>

        {navigationOrder && (
          <div className="navigationBanner">
            <strong>🧭 Navigation</strong>
            <span>
              Pickup: {navigationOrder.shop_name || 'Demo Pickup Shop'}
            </span>
            <button onClick={() => setNavigationOrder(null)}>
              ✕
            </button>
          </div>
        )}
      </div>

      {orders.length > 0 && (
        <div className="homeOrderPreview">
          <div className="sectionTitle">
            <strong>Orders</strong>
            <button onClick={() => {
          setShowProfile(false)
          setShowNotifications(false)
          setActiveTab('orders')
        }}>
              View All
            </button>
          </div>

          {orders.slice(0, 1).map((order) => {
            const deliveryCharge = Number(order.delivery_fee || 0)
            const tip = Number(
              order.tip_amount ??
              order.tip ??
              order.customer_tip ??
              0
            )

            return (
              <div className="partnerOrderCard" key={order.id}>
                <div className="orderTop">
                  <strong>Order #{order.id}</strong>
                  <span>{order.status}</span>
                </div>

                <p>🏪 {order.shop_name || `Shop ID: ${order.shop_id}`}</p>
                <p>📍 {order.delivery_address || 'Delivery location available'}</p>

                {order.customer_phone && (
                  <div className="customerContactCard">
                    <div>
                      <strong>👤 {order.customer_name || 'Customer'}</strong>
                      <span>📞 {order.customer_phone}</span>
                    </div>

                    <a
                      className="callCustomerButton"
                      href={`tel:${String(order.customer_phone).replace(/[^0-9+]/g, '')}`}
                    >
                      📞 Call Customer
                    </a>
                  </div>
                )}

                <div className="partnerMoney">
                  <div>
                    <span>Delivery Charge</span>
                    <strong>₹{deliveryCharge.toFixed(0)}</strong>
                  </div>

                  <div>
                    <span>Tip</span>
                    <strong>+ ₹{tip.toFixed(0)}</strong>
                  </div>

                  <div className="youEarn">
                    <span>You Earn</span>
                    <strong>₹{(deliveryCharge + tip).toFixed(0)}</strong>
                  </div>
                </div>

                <div className="orderActions">
                  <button
                    className="routeButton"
                    onClick={() => {
                      setNavigationOrder(order)
                      setShowProfile(false)
                      setActiveTab('home')

                      const lat = Number(
                        order.pickup_latitude ??
                        order.shop_latitude ??
                        order.latitude
                      )
                      const lng = Number(
                        order.pickup_longitude ??
                        order.shop_longitude ??
                        order.longitude
                      )

                      setTimeout(() => {
                        if (mapRef.current) {
                          if (
                            Number.isFinite(lat) &&
                            Number.isFinite(lng)
                          ) {
                            mapRef.current.setView([lat, lng], 16)
                            L.marker([lat, lng])
                              .addTo(mapRef.current)
                              .bindPopup('↻ Pickup Location')
                              .openPopup()
                          } else {
                            mapRef.current.setView(
                              [13.2975, 77.5432],
                              14
                            )
                          }

                          mapRef.current.invalidateSize()
                        }
                      }, 150)
                    }}
                  >
                    🧭 View Route
                  </button>

                  {order.status === 'PARTNER_ASSIGNED' &&
                    !acceptedOrderIds.includes(order.id) && (
                      <button
                        className="acceptButton"
                        onClick={async () => {
                          if (!partner?.id) {
                            alert('❌ Partner profile not found')
                            return
                          }

                          if (!partner?.Phone || !String(partner.Phone).trim()) {
                            alert('📱 Mobile number compulsory. Profile alli mobile number add madi, aamele Order Accept madi.')
                            setShowProfile(true)
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
                            alert(
                              '❌ Order is no longer available'
                            )
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
                        ✅ Accept Order
                      </button>
                    )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )}

  {activeTab === 'orders' && (
    <div className="dashboardPage">
      <div className="pageHeading">
        <h2>📦 Orders</h2>
        <span>{orders.length} active</span>
      </div>

      {orders.length === 0 ? (
        <div className="emptyOrders">
          <div>🗺️</div>
          <h3>No Orders</h3>
          <p>New delivery orders will appear here.</p>
        </div>
      ) : (
        orders.map((order) => {
          const deliveryCharge = Number(order.delivery_fee || 0)
          const tip = Number(
            order.tip_amount ??
            order.tip ??
            order.customer_tip ??
            0
          )

          return (
            <div className="partnerOrderCard" key={order.id}>
              <div className="orderTop">
                <strong>Order #{order.id}</strong>
                <span>{order.status}</span>
              </div>

              <p>
                🏪 {order.shop_name || `Shop ID: ${order.shop_id}`}
              </p>

              <p>↻ Pickup location</p>

              <div className="partnerMoney">
                <div>
                  <span>Delivery Charge</span>
                  <strong>₹{deliveryCharge.toFixed(0)}</strong>
                </div>

                <div>
                  <span>Tip</span>
                  <strong>+ ₹{tip.toFixed(0)}</strong>
                </div>

                <div className="youEarn">
                  <span>You Earn</span>
                  <strong>
                    ₹{(deliveryCharge + tip).toFixed(0)}
                  </strong>
                </div>
              </div>

              <div className="orderActions">
                <button
                  className="routeButton"
                  onClick={() => {
                    setNavigationOrder(order)
                    setShowProfile(false)
                      setActiveTab('home')

                    setTimeout(() => {
                      if (mapRef.current) {
                        mapRef.current.invalidateSize()

                        const lat = Number(
                          order.pickup_latitude ??
                          order.shop_latitude ??
                          order.latitude
                        )
                        const lng = Number(
                          order.pickup_longitude ??
                          order.shop_longitude ??
                          order.longitude
                        )

                        if (
                          Number.isFinite(lat) &&
                          Number.isFinite(lng)
                        ) {
                          mapRef.current.setView(
                            [lat, lng],
                            16
                          )
                        } else {
                          mapRef.current.setView(
                            [13.2975, 77.5432],
                            14
                          )
                        }
                      }
                    }, 150)
                  }}
                >
                  🧭 Navigation
                </button>

                {order.status === 'PARTNER_ASSIGNED' &&
                  !acceptedOrderIds.includes(order.id) && (
                    <button
                      className="acceptButton"
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
                          alert(
                            '❌ Order is no longer available'
                          )
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
                      }}
                    >
                      ✅ Accept Order
                    </button>
                  )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )}

  {activeTab === 'earnings' && (
    <div className="dashboardPage">
      <div className="pageHeading">
        <h2>💰 Earnings</h2>
      </div>

      <div className="earningsHero">
        <span>Total Earnings</span>
        <strong>
          ₹{profileStats.totalEarnings.toFixed(2)}
        </strong>
      </div>

      <div className="earningsGrid">
        <div>
          <span>Orders</span>
          <strong>{profileStats.totalOrders}</strong>
        </div>
        <div>
          <span>This Week</span>
          <strong>
            ₹{profileStats.weekEarnings.toFixed(2)}
          </strong>
        </div>
      </div>
    </div>
  )}

  <nav className="sipgoBottomNav">
    <button
      type="button"
      className={activeTab === 'home' ? 'active' : ''}
      onClick={() => {
        setShowProfile(false)
        setShowNotifications(false)
        setNavigationOrder(null)
        setActiveTab('home')

        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize()
          }
        }, 500)
      }}
    >
      <span>🏠</span>
      <small>Home</small>
    </button>

    <button
      className={activeTab === 'orders' ? 'active' : ''}
      onClick={() => {
          setShowProfile(false)
          setActiveTab('orders')
        }}
    >
      <span>📦</span>
      <small>Orders</small>
      {orders.length > 0 && (
        <b>{orders.length}</b>
      )}
    </button>

    <button
      className={activeTab === 'earnings' ? 'active' : ''}
      onClick={() => {
          setShowProfile(false)
          setShowNotifications(false)
          setActiveTab('earnings')
        }}
    >
      <span>💰</span>
      <small>Earnings</small>
    </button>

    <button
      type="button"
      className={showProfile ? 'active' : ''}
      onClick={() => {
        setActiveTab('home')
        setShowNotifications(false)
        setShowProfile(true)
      }}
    >
      <span>👤</span>
      <small>Profile</small>
    </button>
  </nav>

</section>
        )}


        </main>
      </div>
  )
}

export default App
